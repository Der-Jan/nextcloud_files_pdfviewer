/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { showError } from '@nextcloud/dialogs'
import { emit } from '@nextcloud/event-bus'
import { Permission } from '@nextcloud/files'
import { parsePermissions } from '@nextcloud/files/dav'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PDFView from '../../src/views/PDFView.vue'
import renamePdfFile from '../../src/services/renamePdfFile.js'
import { mountFilenameTitle } from '../../src/views/filenameTitle.js'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn() }))

vi.mock('@nextcloud/event-bus', () => ({ emit: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }))
vi.mock('../../src/services/renamePdfFile.js', () => ({
	default: vi.fn(),
	canRenamePdf: (file) => file?.permissions.includes('N'),
}))
vi.mock('../../src/utils/davUtils.js', () => ({ getRootPath: () => 'http://localhost/remote.php/dav/files/alice' }))

let cleanup
let loader
let viewer
beforeEach(() => {
	vi.clearAllMocks()
	document.body.innerHTML = '<div id="viewer"><header><h2 id="modal-title" data-v-modal="" class="modal-header__name">report.pdf</h2></header><iframe></iframe></div>'
	const file = { fileid: 1, filename: '/report.pdf', basename: 'report.pdf', permissions: 'RGDNVW', mime: 'application/pdf', size: 1234, lastmod: '2026-10-01T12:00:00Z' }
	viewer = {
		currentFile: file,
		fileList: [{ ...file }],
		$el: document.getElementById('viewer'),
		$refs: {},
		updateTitle: vi.fn(),
	}
	loader = {
		active: true,
		$parent: viewer,
		pdfView: { canRenameDocument: () => true, $refs: { iframe: document.querySelector('iframe') } },
	}
	viewer.$refs.content = loader
	renamePdfFile.mockResolvedValue({ basename: 'new.pdf', filename: '/new.pdf', source: 'http://localhost/remote.php/dav/files/alice/new.pdf', davPath: 'http://localhost/remote.php/dav/files/alice/new.pdf' })
})
afterEach(() => {
	cleanup?.()
	document.body.innerHTML = ''
})

async function submit() {
	document.querySelector('button').click()
	await flushPromises()
	const input = document.querySelector('input')
	input.value = 'new.pdf'
	input.dispatchEvent(new Event('input', { bubbles: true }))
	document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
	await flushPromises()
}

describe('Viewer title bridge', () => {
	it('updates the active file and list, publishes the move, and restores the original title on cleanup', async () => {
		cleanup = mountFilenameTitle(loader)
		expect(document.querySelectorAll('#modal-title')).toHaveLength(1)
		expect(document.querySelector('.files-pdfviewer__title').hasAttribute('data-v-modal')).toBe(true)
		await submit()
		expect(viewer.currentFile.filename).toBe('/new.pdf')
		expect(viewer.fileList[0]).toEqual(viewer.currentFile)
		const renamedNode = emit.mock.calls.find(([event]) => event === 'files:node:renamed')[1]
		expect(renamedNode.permissions).toBe(parsePermissions('RGDNVW'))
		expect(renamedNode.size).toBe(1234)
		expect(renamedNode.mtime).toEqual(new Date('2026-10-01T12:00:00Z'))
		expect(viewer.updateTitle).toHaveBeenCalledWith('new.pdf')
		expect(emit).toHaveBeenCalledWith('files:node:moved', expect.objectContaining({ oldSource: 'http://localhost/remote.php/dav/files/alice/report.pdf' }))
		cleanup()
		cleanup = undefined
		expect(document.querySelector('.files-pdfviewer__title')).toBeNull()
		expect(document.getElementById('modal-title').className).toBe('modal-header__name')
	})

	it.each(['isDavRessource', 'isDavResource'])('keeps renamed PDFs eligible for preview using %s', async (davProperty) => {
		cleanup = mountFilenameTitle(loader)
		await submit()
		const { node } = emit.mock.calls.find(([event]) => event === 'files:node:moved')[1]
		// Viewer checks DAV location, read permission, and MIME before offering preview.
		expect(node[davProperty] && node.root?.startsWith('/files')).toBe(true)
		expect(Boolean(node.permissions & Permission.READ)).toBe(true)
		expect(node.mime).toBe('application/pdf')
		expect(node.path).toBe('/new.pdf')
	})

	it('leaves metadata unchanged on failure and restores iframe interaction', async () => {
		renamePdfFile.mockRejectedValue({ response: { status: 403 } })
		cleanup = mountFilenameTitle(loader)
		await submit()
		expect(viewer.currentFile.filename).toBe('/report.pdf')
		expect(emit).not.toHaveBeenCalled()
		expect(loader.pdfView.$refs.iframe.inert).toBe(false)
	})

	it('does not rename while the document has unsaved edits', async () => {
		loader.pdfView.canRenameDocument = () => false
		cleanup = mountFilenameTitle(loader)
		await submit()
		expect(renamePdfFile).not.toHaveBeenCalled()
		expect(showError).toHaveBeenCalledWith(expect.stringContaining('save your PDF changes'))
	})

	it.each(['inactive', 'comparison', 'read-only', 'missing header'])('leaves the title alone for %s views', (mode) => {
		if (mode === 'inactive') {
			loader.active = false
		}
		if (mode === 'comparison') {
			viewer.$refs.content = {}
		}
		if (mode === 'read-only') {
			viewer.currentFile.permissions = 'R'
		}
		if (mode === 'missing header') {
			document.querySelector('h2').remove()
		}
		cleanup = mountFilenameTitle(loader)
		expect(document.querySelector('button')).toBeNull()
	})
})

describe('PDF rename readiness', () => {
	it('requires a loaded document with saved edits and no upload in progress', () => {
		const button = document.createElement('button')
		const context = { PDFViewerApplication: null, isSaving: false, getDownloadElement: () => button }
		expect(PDFView.methods.canRenameDocument.call(context)).toBe(false)
		context.PDFViewerApplication = { pdfDocument: {} }
		expect(PDFView.methods.canRenameDocument.call(context)).toBe(false)
		button.setAttribute('disabled', '')
		expect(PDFView.methods.canRenameDocument.call(context)).toBe(true)
		context.isSaving = true
		expect(PDFView.methods.canRenameDocument.call(context)).toBe(false)
	})
})
