import _ from 'lodash'
import React, { Component } from 'react'
import PT from 'prop-types'
import cn from 'classnames'

import './FillProjectDetails.scss'
import ProjectBasicDetailsForm from '../components/ProjectBasicDetailsForm'
import HeaderWithProgress from './HeaderWithProgress'

class FillProjectDetails extends Component  {
  constructor(props) {
    super(props)
    this.createMarkup = this.createMarkup.bind(this)
    this.handleStepChange = this.handleStepChange.bind(this)
    this.state = { project: {}, currentWizardStep: null }
  }

  componentWillMount() {
    this.componentWillReceiveProps(this.props)
  }

  componentWillReceiveProps(nextProps) {
    this.setState({ project: nextProps.project })
  }

  handleStepChange(currentWizardStep) {
    this.setState({currentWizardStep})
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !(
      _.isEqual(nextProps.project, this.props.project)
     && _.isEqual(nextProps.dirtyProject, this.props.dirtyProject)
     && _.isEqual(nextState.project, this.state.project)
     && _.isEqual(nextProps.error, this.props.error)
     && _.isEqual(nextState.currentWizardStep, this.state.currentWizardStep)
     && _.isEqual(nextProps.projectTemplates, this.props.projectTemplates)
    )
  }

  createMarkup(projectTemplate) {
    return {__html: _.get(projectTemplate, 'scope.formTitle', `Let's setup your ${ projectTemplate.name } project`) }
  }

  render() {
    const { project, processing, submitBtnText, projectTemplates, dirtyProject, productTemplates, productCategories, shouldUpdateTemplate } = this.props
    const { currentWizardStep } = this.state
    const projectTemplateId = _.get(project, 'templateId')
    const projectTemplate = _.find(projectTemplates, { id: projectTemplateId })
    const formDisclaimer = _.get(projectTemplate, 'scope.formDisclaimer')

    const template = projectTemplate.scope

    let header = null

    if (!_.get(template, 'wizard.enabled')) {
      header = (
        <div className="text-header-wrapper">
          <h1 dangerouslySetInnerHTML = {this.createMarkup(projectTemplate)} />
        </div>
      )
    } else {
      const currentSection = currentWizardStep && template.sections[currentWizardStep.sectionIndex]

      if (!currentSection || currentSection && !currentSection.hideFormHeader) {
        header = (
          <HeaderWithProgress
            template={template}
            currentWizardStep={currentWizardStep}
            project={dirtyProject}
            hidePrice={template.hidePrice}
          />
        )
      }
    }

    return (
      <div
        className={cn('FillProjectDetailsWrapper', {
          [`form-theme-${template.theme}`]: template.theme
        })}
      >
        <div className="FillProjectDetails">
          <div className="header">
            {header}
          </div>
          <section className="two-col-content content">
            <div className="container">
              <div className="left-area">
                <div className="left-area-content">
                  <ProjectBasicDetailsForm
                    project={project}
                    dirtyProject={dirtyProject}
                    template={template}
                    isEditable
                    submitHandler={this.props.onCreateProject}
                    addAttachment={this.props.addAttachment}
                    updateAttachment={this.props.updateAttachment}
                    removeAttachment={this.props.removeAttachment}
                    attachmentsStorePath={this.props.attachmentsStorePath}
                    canManageAttachments={this.props.canManageAttachments}
                    saving={processing}
                    onProjectChange={this.props.onProjectChange}
                    submitBtnText={ submitBtnText }
                    productTemplates={productTemplates}
                    onStepChange={this.handleStepChange}
                    productCategories={productCategories}
                    shouldUpdateTemplate={shouldUpdateTemplate}
                  />
                </div>
                {formDisclaimer && (
                  <div className="left-area-footer">
                    <span>{formDisclaimer}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }
}

FillProjectDetails.defaultProps = {
  shouldUpdateTemplate: false
}

FillProjectDetails.propTypes = {
  // onProjectChange: PT.func.isRequired,
  onBackClick: PT.func.isRequired,
  onCreateProject: PT.func.isRequired,
  onChangeProjectType: PT.func.isRequired,
  project: PT.object.isRequired,
  projectTemplates: PT.array.isRequired,
  productTemplates: PT.array.isRequired,
  productCategories: PT.array.isRequired,
  userRoles: PT.arrayOf(PT.string),
  processing: PT.bool,
  templates: PT.array.isRequired,
  error: PT.oneOfType([
    PT.bool,
    PT.object
  ]),
  shouldUpdateTemplate: PT.bool,
}

export default FillProjectDetails
