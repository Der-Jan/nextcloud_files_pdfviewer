/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { emit } from '@nextcloud/event-bus'
import { File } from '@nextcloud/files'
import { parsePermissions } from '@nextcloud/files/dav'
import { translate as t } from '@nextcloud/l10n'
import { createApp } from 'vue'
import FilenameTitle from '../components/FilenameTitle.vue'
import renamePdfFile, { canRenamePdf } from '../services/renamePdfFile.js'
import { getRootPath } from '../utils/davUtils.js'

/**
 * Bridge to the Vue 2 Viewer's modal title, which has no title slot.
 * Keep this compatibility code outside the PDF renderer. If the host changes
 * its structure, leave its original title intact.
 *
 * @param {object} loader The Vue 2 MIME component
 * @return {() => void} Cleanup for navigation and unmount
 */
export function mountFilenameTitle(loader) {
	let viewer = loader.$parent
	while (viewer && viewer.$refs?.content !== loader) {
		viewer = viewer.$parent
	}
	const file = viewer?.currentFile
	const title = viewer?.$el?.querySelector?.('.modal-header__name')
	if (!loader.active || !title || !canRenamePdf(file)) {
		return () => {}
	}

	const container = document.createElement('div')
	container.className = 'modal-header__name files-pdfviewer__title'
	// Preserve NcModal's scoped layout, including its centered desktop title.
	for (const attribute of title.getAttributeNames()) {
		if (attribute.startsWith('data-v-')) {
			container.setAttribute(attribute, title.getAttribute(attribute))
		}
	}
	title.after(container)
	// Retain the original heading as the modal's accessible label.
	title.classList.add('files-pdfviewer__original-title')
	const app = createApp(FilenameTitle, {
		filename: file.basename,
		rename: async (name) => {
			if (!loader.pdfView?.canRenameDocument()) {
				throw new Error(t('files_pdfviewer', 'Please finish loading and save your PDF changes before renaming.'))
			}
			// Prevent changes while the MOVE request is in flight.
			const iframe = loader.pdfView.$refs.iframe
			iframe.inert = true
			const oldFilename = file.filename
			try {
				const changes = await renamePdfFile(file, name)
				const oldSource = getRootPath() + oldFilename
				const node = new File({
					source: getRootPath() + changes.filename,
					root: new URL(getRootPath(), window.location.href).pathname.split('/dav')[1],
					id: file.fileid,
					mime: file.mime,
					owner: file.ownerId ?? null,
					size: file.size,
					permissions: parsePermissions(file.permissions),
					mtime: file.mtime || file.lastmod ? new Date(file.mtime || file.lastmod) : undefined,
					attributes: { ...file, favorite: file.isFavorite ? 1 : 0 },
				})
				// Nextcloud 32's Viewer still checks the old DAV property spelling.
				Object.defineProperty(node, 'isDavRessource', { get: () => node.isDavResource })
				// Viewer clones the active item; update both it and its list.
				for (const entry of viewer.fileList) {
					if (entry.filename === oldFilename && entry.fileid === file.fileid) {
						Object.assign(entry, changes)
					}
				}
				Object.assign(file, changes)
				if (viewer.currentFile === file) {
					viewer.updateTitle(name)
				}
				emit('files:node:renamed', node)
				emit('files:node:moved', { node, oldSource })
			} finally {
				iframe.inert = false
			}
		},
	})
	app.mount(container)
	return () => {
		app.unmount()
		container.remove()
		title.classList.remove('files-pdfviewer__original-title')
	}
}
