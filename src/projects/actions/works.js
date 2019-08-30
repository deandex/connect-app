import moment from 'moment'
import _ from 'lodash'
import {
  getWorkInfo,
  updateWorkInfo,
  newWorkInfo,
  deleteWorkInfo,
  getWorkitems,
  newWorkitem,
  deleteWorkitem as deleteWorkitemApi
} from '../../api/works'
import {
  createTimeline,
  createMilestone,
  updateMilestone,
} from '../../api/timelines'
import {
  loadWorkTimeline,
} from './workTimelines'
import {
  syncProjectStatus,
} from './workPhaseCommon'
import {
  getChallengesByFilter,
} from '../../api/challenges'
import {
  LOAD_WORK_INFO,
  UPDATE_WORK_INFO,
  NEW_WORK_INFO,
  DELETE_WORK_INFO,
  LOAD_CHALLENGES,
  LOAD_CHALLENGES_START,
  LOAD_WORK_ITEM,
  NEW_WORK_ITEM,
  DELETE_WORK_ITEM,
  DELETE_WORK_ITEM_START,
  LOAD_CHALLENGES_WORK_ITEM,
  PHASE_STATUS_ACTIVE,
  MILESTONE_STATUS,
  MILESTONE_TYPE,
} from '../../config/constants'

/**
 * Load work info
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {String} workId       work id
 *
 * @return {Function} dispatch function
 */
export function loadWorkInfo(projectId, workstreamId, workId) {
  return (dispatch) => {
    return dispatch({
      type: LOAD_WORK_INFO,
      payload: getWorkInfo(projectId, workstreamId, workId)
    })
  }
}

/**
 * Create default milestones for work
 *
 * Creates 2 milestones:
 * - Start, with status `active`
 * - Complete, with status `draft`
 *
 * @param {Object} work     work
 * @param {Object} timeline timeline
 *
 * @returns {Promise<Object>} complete milestone
 */
function createDefaultMilestones(work, timeline) {
  const startMilestoneDuration = work.duration > 1 ? work.duration - 1 : 1
  const completeMilestoneDuration = 1
  // as we creating the first milestone as active, we set the start day as today
  const startDate = moment()

  return createMilestone(timeline.id, {
    name: 'Start',
    type: MILESTONE_TYPE.COMMUNITY_WORK,
    duration: startMilestoneDuration,
    startDate,
    actualStartDate: startDate,
    endDate: startDate.clone().add(startMilestoneDuration - 1, 'days'),
    status: MILESTONE_STATUS.ACTIVE,
    order: 1,
    plannedText: 'empty',
    activeText: 'empty',
    completedText: 'empty',
    blockedText: 'empty',
  }).then(() => createMilestone(timeline.id, {
    name: 'Complete',
    type: MILESTONE_TYPE.COMMUNITY_WORK,
    duration: completeMilestoneDuration,
    startDate: startDate.clone().add(startMilestoneDuration, 'days'),
    endDate: startDate.clone().add(startMilestoneDuration + completeMilestoneDuration - 1, 'days'),
    status: MILESTONE_STATUS.PLANNED,
    order: 2,
    plannedText: 'empty',
    activeText: 'empty',
    completedText: 'empty',
    blockedText: 'empty',
  }))
}

/**
 * Update work info
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {String} workId       work id
 * @param {Object} updatedProps param need to update
 * @param {Array} progressIds   array of progress id
 *
 * @return {Function} dispatch function
 */
export function updateWork(projectId, workstreamId, workId, updatedProps, progressIds) {
  return (dispatch, getState) => {
    const state = getState()
    const work = state.works.work
    const workTimeline = _.get(state.workTimelines.timelines[workId], 'timeline')

    const isWorkActivated = work.status !== PHASE_STATUS_ACTIVE &&
      updatedProps.status === PHASE_STATUS_ACTIVE
    const hasMilestones = workTimeline && workTimeline.milestones && workTimeline.milestones.length > 0
    const hasActiveMilestone = _.find(workTimeline.milestones, { status: MILESTONE_STATUS.ACTIVE })
    let isTimelineChanged

    return dispatch({
      type: UPDATE_WORK_INFO,
      payload: updateWorkInfo(projectId, workstreamId, workId, updatedProps),
      meta: {
        progressIds
      }
    }).then(() => {
      if (isWorkActivated) {
        // if work has been activated, but doesn't have any milestones yet,
        // we should created default milestones with the first one active
        if (!hasMilestones) {
          isTimelineChanged = true
          return createDefaultMilestones(work, workTimeline)
        }

        // if work has been activated but don't have yet any active milestone,
        // than activate the first milestone
        if (!hasActiveMilestone) {
          isTimelineChanged = true
          return updateMilestone(workTimeline.id, workTimeline.milestones[0].id, {
            status: MILESTONE_STATUS.ACTIVE,
          })
        }
      }
    }).then(() => {
      // if timeline has been changed by any reason, we should reload timeline to get updates in Redux store
      if (isTimelineChanged) {
        dispatch(loadWorkTimeline(work.id))
      }

      // update project caused by work updates
      syncProjectStatus(state.projectState.project, work, updatedProps, dispatch)
    })
  }
}

/**
 * Create new work info
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {Object} newProps param need to create
 *
 * @return {Function} dispatch function
 */
export function createWork(projectId, workstreamId, newProps) {
  return (dispatch, getState) => {
    const state = getState()

    return dispatch({
      type: NEW_WORK_INFO,
      payload: newWorkInfo(projectId, workstreamId, newProps).then((work) => (
        // we also, create a timeline for work
        createTimelineForWork(work)
          .then((timeline) => {
            // if we created a work with active status, we should also create default milestones
            if (work.status === PHASE_STATUS_ACTIVE) {
              return createDefaultMilestones(work, timeline, dispatch)
            }
          })
          // after we created timeline for work, we should load the timeline to the Redux store
          // we wait until timeline is loaded before finishing work creating action
          // as we need milestone to render work card on the workstreams list (though not critical)
          .then(() =>
            // actually we have to wait until the timeline is created, so we can show the work card using timeline
            // but sometimes after we create timeline and load it immediately, we cannot find it due to ES indexing issue
            // so we are catching the error for such cases, as failing to load timeline shouldn't fail work creation
            dispatch(loadWorkTimeline(work.id)).catch(() => {})
          )
          .then(() => work )
      )),
      meta: {
        workstreamId,
      },
    }).then(() => {
      // update project caused by work creation
      syncProjectStatus(state.projectState.project, {}, newProps, dispatch)
    })
  }
}

/**
 * Create timeline for work
 *
 * @param {Object} work work
 *
 * @return {Promise<Object>} timeline
 */
function createTimelineForWork(work) {
  return createTimeline({
    name: 'Work timeline',
    description: 'This timeline will represent the main milestones in this work.',
    startDate: moment(work.startDate).format('YYYY-MM-DD'),
    endDate: null,
    reference: 'work',
    referenceId: work.id,
  })
}

/**
 * Delete work info
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {String} workId       work id
 *
 * @return {Function} dispatch function
 */
export function deleteWork(projectId, workstreamId, workId) {
  return (dispatch) => {
    return dispatch({
      type: DELETE_WORK_INFO,
      payload: deleteWorkInfo(projectId, workstreamId, workId)
    })
  }
}

/**
  * Start get list of challenge
 *
 * @return {Function} empty dispatch function
  */
export function startLoadChallenges() {
  return (dispatch) => {
    return dispatch({
      type: LOAD_CHALLENGES_START,
      payload: Promise.resolve()
    })
  }
}

/**
  * Get list of challenge
  * @param {String} query query string
  * @param {Number} directProjectId direct project id
  * @param {Number} offset offset of the list, default 0
 *
 * @return {Function} dispatch function
  */
export function loadChallenges(query, directProjectId, offset=0) {
  let filterString = 'status=ACTIVE'
  if (query) {
    filterString += `&name=${query}`
  }
  if (!_.isNil(directProjectId)) {
    filterString += `&projectId=${directProjectId}`
  }
  return (dispatch) => {
    return dispatch({
      type: LOAD_CHALLENGES,
      payload: getChallengesByFilter(encodeURIComponent(filterString), offset)
    })
  }
}

/**
  * Get list of challenge of workitems
  * @param {Array} workitems work item array
  * @param {Object} dispatch dispatch for action
 *
 * @return {Function} dispatch function
  */
export function loadChallengesForWorkItems(workitems, dispatch) {
  const challengesId = workitems.map(workItem => _.get(workItem, 'details.challengeId')).join(',')
  return dispatch({
    type: LOAD_CHALLENGES_WORK_ITEM,
    payload: getChallengesByFilter(`id=in(${challengesId})`, null)
  })
}

/**
 * Load work items
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {String} workId       work id
 *
 * @return {Function} dispatch function
 */
export function loadWorkitems(projectId, workstreamId, workId) {
  return (dispatch) => {
    return dispatch({
      type: LOAD_WORK_ITEM,
      payload: getWorkitems(projectId, workstreamId, workId)
        .then((results) => {
          if (results.length > 0) {
            loadChallengesForWorkItems(results, dispatch)
          }
          return results
        })
    })
  }
}

/**
 * Create work item for a challenge
 *
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {String} workId       work id
 * @param {Object} challenge challenge
 *
 * @return {Promise} workitem
 */
function createWorkitemForChallenge(projectId, workstreamId, workId, challenge) {
  return newWorkitem(projectId, workstreamId, workId, {
    name: challenge.name,
    directProjectId: challenge.projectId,
    type: `challenge-${challenge.subTrack}`,
    templateId: challenge.templateId,
    details: {
      challengeId: challenge.id
    },
  })
}

/**
 * Create new work item
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {String} workId       work id
 * @param {Array} challenges  list of selected challenges
 *
 * @return {Function} dispatch function
 */
export function createWorkitem(projectId, workstreamId, workId, challenges) {
  return (dispatch) => {
    return dispatch({
      type: NEW_WORK_ITEM,
      payload: Promise.all(challenges.map(challenge => createWorkitemForChallenge(projectId, workstreamId, workId, challenge)))
        .then((results) => {
          results.forEach((workitem) => {
            const challengeId = _.get(workitem, 'details.challengeId', 0)
            workitem.challenge = _.find(challenges, { id: challengeId })
          })
          return results
        })
    })
  }
}

/**
  * Start delete work item
 * @param {String} workItemId       work item id
 *
 * @return {Function} empty dispatch function
  */
export function startDeleteWorkitem(workItemId) {
  return (dispatch) => {
    return dispatch({
      type: DELETE_WORK_ITEM_START,
      payload: Promise.resolve(workItemId)
    })
  }
}

/**
 * Delete new work item
 * @param {String} projectId    project id
 * @param {String} workstreamId workstream id
 * @param {String} workId       work id
 * @param {String} workItemId       work item id
 *
 * @return {Function} dispatch function
 */
export function deleteWorkitem(projectId, workstreamId, workId, workItemId) {
  return (dispatch) => {
    return dispatch({
      type: DELETE_WORK_ITEM,
      payload: deleteWorkitemApi(projectId, workstreamId, workId, workItemId)
    })
  }
}