/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import axios from '@nextcloud/axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import renamePdfFile, { canRenamePdf } from '../../src/services/renamePdfFile.js'
import { getRootPath, isPublic } from '../../src/utils/davUtils.js'

vi.mock('@nextcloud/capabilities', () => ({ getCapabilities: () => ({ files: {} }) }))
vi.mock('@nextcloud/axios', () => ({ default: vi.fn() }))
vi.mock('@nextcloud/auth', () => ({ getRequestToken: () => 'csrf-token', getCurrentUser: () => ({ uid: 'alice' }) }))
vi.mock('../../src/utils/davUtils.js', () => ({
	getRootPath: vi.fn(() => 'http://localhost/remote.php/dav/files/alice'),
	isPublic: vi.fn(() => false),
}))

const file = { filename: '/Documents/report.pdf', basename: 'report.pdf', permissions: 'RDNVW' }

beforeEach(() => {
	vi.clearAllMocks()
	isPublic.mockReturnValue(false)
	getRootPath.mockReturnValue('http://localhost/remote.php/dav/files/alice')
})

describe('PDF rename', () => {
	it('encodes paths and never overwrites another file', async () => {
		const changes = await renamePdfFile(file, 'Budget #1 & résumé.pdf')
		expect(axios).toHaveBeenCalledWith({
			method: 'MOVE',
			url: 'http://localhost/remote.php/dav/files/alice/Documents/report.pdf',
			headers: {
				Destination: 'http://localhost/remote.php/dav/files/alice/Documents/Budget%20%231%20%26%20r%C3%A9sum%C3%A9.pdf',
				Overwrite: 'F',
				requesttoken: 'csrf-token',
			},
		})
		expect(changes.filename).toBe('/Documents/Budget #1 & résumé.pdf')
		expect(changes.source).toBe(changes.davPath)
		expect(file.filename).toBe('/Documents/report.pdf')
	})

	it.each(['', '   ', '.', '..', '../other.pdf', 'a/b.pdf', 'a\\b.pdf', 'report.txt'])('rejects invalid names: %s', async (name) => {
		await expect(renamePdfFile(file, name)).rejects.toThrow()
		expect(axios).not.toHaveBeenCalled()
	})

	it('does not change metadata when the server rejects the rename', async () => {
		axios.mockRejectedValueOnce({ response: { status: 412 } })
		await expect(renamePdfFile(file, 'existing.pdf')).rejects.toMatchObject({ response: { status: 412 } })
		expect(file.filename).toBe('/Documents/report.pdf')
	})

	it('allows renaming a PDF without a filename extension', async () => {
		await expect(renamePdfFile({ ...file, basename: 'report', filename: '/Documents/report' }, 'renamed'))
			.resolves.toMatchObject({ basename: 'renamed', filename: '/Documents/renamed' })
	})

	it('accepts an encoded email-style username in the Viewer source', async () => {
		getRootPath.mockReturnValue('http://localhost/remote.php/dav/files/jan@example.com')
		const emailUserFile = {
			...file,
			source: 'http://localhost/remote.php/dav/files/jan%40example.com/Documents/report.pdf',
		}
		expect(canRenamePdf(emailUserFile)).toBe(true)
		await expect(renamePdfFile(emailUserFile, 'renamed.pdf')).resolves.toMatchObject({ basename: 'renamed.pdf' })
	})

	it.each([
		'http://localhost/remote.php/dav/files/alice%2FDocuments/report.pdf',
		'http://localhost/remote.php/dav/files/alice/Documents/%zz.pdf',
		'http://localhost/remote.php/dav/files/alice/Documents/report.pdf?download=1',
	])('rejects non-equivalent or malformed DAV URLs: %s', (source) => {
		expect(canRenamePdf({ ...file, source })).toBe(false)
	})

	it('requires rename permission and an authenticated DAV file', () => {
		expect(canRenamePdf(file)).toBe(true)
		expect(canRenamePdf({ ...file, permissions: 'RW' })).toBe(false)
		expect(canRenamePdf({ ...file, source: 'https://example.com/report.pdf' })).toBe(false)
		isPublic.mockReturnValue(true)
		expect(canRenamePdf(file)).toBe(false)
	})
})
