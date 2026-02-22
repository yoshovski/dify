import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContext } from 'use-context-selector'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { RiAddLine, RiArrowDownSLine, RiCheckLine, RiDeleteBinLine } from '@remixicon/react'
import { ToastContext } from '@/app/components/base/toast'
import Modal from '@/app/components/base/modal'
import Button from '@/app/components/base/button'
import Input from '@/app/components/base/input'
import PlanBadge from '@/app/components/header/plan-badge'
import type { Plan } from '@/app/components/billing/type'
import { useWorkspacesContext } from '@/context/workspace-context'
import { archiveWorkspace, createWorkspace, switchWorkspace } from '@/service/common'
import { cn } from '@/utils/classnames'
import { basePath } from '@/utils/var'

const WorkplaceSelector = () => {
  const { t } = useTranslation('common')
  const { notify } = useContext(ToastContext)
  const { workspaces } = useWorkspacesContext()
  const currentWorkspace = workspaces.find(v => v.current)
  const [isShowCreateModal, setIsShowCreateModal] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [isShowDeleteModal, setIsShowDeleteModal] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null)

  const handleArchiveWorkspace = async () => {
    if (!workspaceToDelete)
      return
    try {
      await archiveWorkspace(workspaceToDelete)
      notify({ type: 'success', message: t('actionMsg.modifiedSuccessfully', { ns: 'common' }) })
      setIsShowDeleteModal(false)
      setWorkspaceToDelete(null)
      location.reload()
    }
    catch (e: any) {
      notify({ type: 'error', message: e.message || t('api.actionFailed', { ns: 'common' }) })
      setIsShowDeleteModal(false)
    }
  }

  const handleSwitchWorkspace = async (tenant_id: string) => {
    try {
      if (currentWorkspace?.id === tenant_id)
        return
      await switchWorkspace({ url: '/workspaces/switch', body: { tenant_id } })
      notify({ type: 'success', message: t('actionMsg.modifiedSuccessfully', { ns: 'common' }) })
      location.assign(`${location.origin}${basePath}`)
    }
    catch {
      notify({ type: 'error', message: t('provider.saveFailed', { ns: 'common' }) })
    }
  }

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) {
      notify({ type: 'error', message: t('errorMsg.fieldRequired', { field: t('node.name', { ns: 'common' }), ns: 'common' }) })
      return
    }
    try {
      const { id } = await createWorkspace({ body: { name: newWorkspaceName } })
      notify({ type: 'success', message: t('api.actionSuccess', { ns: 'common' }) })
      setIsShowCreateModal(false)
      setNewWorkspaceName('')
      // Switch to the new workspace
      await handleSwitchWorkspace(id)
    }
    catch {
      notify({ type: 'error', message: t('api.actionFailed', { ns: 'common' }) })
    }
  }

  return (
    <Menu as="div" className="relative h-full inline-block text-left">
      {
        ({ open }) => (
          <>
            <MenuButton
              className={cn(
                'group flex items-center h-full px-2 rounded-lg cursor-pointer hover:bg-state-hover-custom',
                open && 'bg-state-hover-custom',
              )}
            >
              <div className="flex items-center text-sm font-medium text-text-primary">
                <div className="mr-2 truncate max-w-[120px]" title={currentWorkspace?.name}>{currentWorkspace?.name}</div>
                <PlanBadge plan={currentWorkspace?.plan as Plan} className='mr-1' />
                <RiArrowDownSLine className="w-4 h-4 text-text-tertiary" />
              </div>
            </MenuButton>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <MenuItems
                className="
                  absolute left-0 mt-2 min-w-[240px] max-w-[320px] max-h-[60vh] overflow-y-auto transform z-[1000]
                  bg-components-panel-bg-blur rounded-xl border-[0.5px] border-components-panel-border shadow-lg
                "
              >
                <div className="flex w-full flex-col items-start self-stretch rounded-xl border-[0.5px] border-components-panel-border p-1 pb-2 shadow-lg ">
                  <div className="flex items-start self-stretch px-3 pb-0.5 pt-1">
                    <span className="system-xs-medium-uppercase flex-1 text-text-tertiary">{t('userProfile.workspace', { ns: 'common' })}</span>
                  </div>
                  {
                    workspaces.map(workspace => (
                      <MenuItem key={workspace.id}>
                        <div
                          className="group flex items-center w-full px-3 py-1.5 text-sm text-text-secondary hover:bg-state-hover-custom cursor-pointer rounded-lg"
                        >
                          <div className='flex items-center justify-between w-full' onClick={() => handleSwitchWorkspace(workspace.id)}>
                            <div className="flex items-center flex-1 min-w-0 mr-2">
                              {workspace.current && <RiCheckLine className="w-4 h-4 text-text-accent mr-2 flex-shrink-0" />}
                              {!workspace.current && <div className="w-6 shrink-0" />}
                              <span className="truncate" title={workspace.name}>{workspace.name}</span>
                              <PlanBadge plan={workspace.plan as Plan} className='ml-2 flex-shrink-0' />
                            </div>
                            {workspace.role === 'owner' && !workspace.current && (
                              <button
                                className="hidden group-hover:block p-1 text-text-tertiary hover:text-text-warning hover:bg-state-destructive-hover rounded flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  setWorkspaceToDelete(workspace.id)
                                  setIsShowDeleteModal(true)
                                }}
                              >
                                <RiDeleteBinLine className="w-[14px] h-[14px]" />
                              </button>
                            )}
                          </div>
                        </div>
                      </MenuItem>
                    ))
                  }
                  <div
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-state-hover-custom"
                    onClick={() => setIsShowCreateModal(true)}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-divider-deep text-text-tertiary">
                      <RiAddLine className="h-4 w-4" />
                    </div>
                    <div className="system-md-regular text-text-secondary">{t('userProfile.createWorkspace')}</div>
                  </div>
                </div>
              </MenuItems>
            </Transition>
            <Modal
              isShow={isShowCreateModal}
              onClose={() => setIsShowCreateModal(false)}
              title={t('userProfile.createWorkspace')}
              className="w-[400px]"
            >
              <div className="space-y-4 py-4">
                <div>
                  <label className="system-sm-medium mb-1 block text-text-secondary">{t('account.workspaceName')}</label>
                  <Input
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder={t('account.workspaceNamePlaceholder') || ''}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setIsShowCreateModal(false)}>{t('operation.cancel')}</Button>
                  <Button variant="primary" onClick={handleCreateWorkspace}>{t('operation.create')}</Button>
                </div>
              </div>
            </Modal>
            <Modal
              isShow={isShowDeleteModal}
              onClose={() => setIsShowDeleteModal(false)}
              title="Delete Workspace"
              className="w-[400px]"
            >
              <div className="space-y-4 py-4">
                <div className="text-text-secondary system-sm-regular">
                  Are you sure you want to delete this workspace? This action cannot be undone.
                </div>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setIsShowDeleteModal(false)}>{t('operation.cancel')}</Button>
                  <Button variant="warning" onClick={handleArchiveWorkspace}>{t('operation.delete')}</Button>
                </div>
              </div>
            </Modal>
          </>
        )
      }
    </Menu>
  )
}

export default WorkplaceSelector
