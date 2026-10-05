/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { getRequestToken } from '@nextcloud/auth'
import axios from '@nextcloud/axios'
import { isFilenameValid } from '@nextcloud/files'
import { translate as t } from '@nextcloud/l10n'
import { encodePath } from '@nextcloud/paths'
import { getRootPath, isPublic } from '../utils/davUtils.js'

/**
 * Whether this is a DAV file whose name the user may change.
 *
 * @param {object} file Viewer file information
 * @return {boolean}
 */
export function canRenamePdf(file) {
	if (isPublic() || typeof file?.permissions !== 'string' || !file.permissions.includes('N') || !file.filename) {
		return false
	}
	const source = file.source ?? file.davPath
	if (!source) {
		return true
	}
	try {
		const actual = new URL(source, window.location.href)
		const expected = new URL(getRootPath() + encodePath(file.filename), window.location.href)
		// Viewer encodes usernames (for example @ as %40), while the DAV
		// root may contain their literal spelling. Compare decoded segments
		// without treating an encoded slash as a path separator.
		const segments = (url) => JSON.stringify(url.pathname.split('/').map(decodeURIComponent))
		return actual.origin === expected.origin
			&& actual.search === expected.search
			&& actual.hash === expected.hash
			&& segments(actual) === segments(expected)
	} catch {
		return false
	}
}

/**
 * Rename without replacing an existing file. Metadata is changed only after success.
 *
 * @param {object} file Viewer file information
 * @param {string} name New basename
 * @return {Promise<object>} Updated paths for the Viewer
 */
export default async function renamePdfFile(file, name) {
	if (!canRenamePdf(file)) {
		throw new Error(t('files_pdfviewer', 'This file cannot be renamed.'))
	}
	if (!name.trim() || !isFilenameValid(name)) {
		throw new Error(t('files_pdfviewer', 'Please enter a valid filename.'))
	}
	const dot = file.basename.lastIndexOf('.')
	const extension = dot > 0 ? file.basename.slice(dot) : ''
	if (!name.toLowerCase().endsWith(extension.toLowerCase())) {
		throw new Error(t('files_pdfviewer', 'Keep the original file extension ({extension}).', { extension }))
	}
	const filename = file.filename.slice(0, file.filename.lastIndexOf('/') + 1) + name
	const source = getRootPath() + encodePath(filename)
	await axios({
		method: 'MOVE',
		url: getRootPath() + encodePath(file.filename),
		headers: {
			Destination: new URL(source, window.location.href).href,
			Overwrite: 'F',
			requesttoken: getRequestToken(),
		},
	})
	return { basename: name, filename, source, davPath: source }
}
