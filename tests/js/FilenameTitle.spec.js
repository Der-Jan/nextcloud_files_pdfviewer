/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { showError } from '@nextcloud/dialogs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilenameTitle from '../../src/components/FilenameTitle.vue'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn() }))

let wrapper
function createTitle(rename = vi.fn().mockResolvedValue(undefined)) {
	wrapper = mount(FilenameTitle, {
		attachTo: document.body,
		props: { filename: 'report.pdf', rename },
	})
	return rename
}
afterEach(() => {
	wrapper?.unmount()
	vi.clearAllMocks()
})

describe('Filename title', () => {
	it('selects the basename, leaving the extension unselected', async () => {
		createTitle()
		await wrapper.get('button').trigger('click')
		const input = wrapper.get('input').element
		expect(document.activeElement).toBe(input)
		expect(input.selectionStart).toBe(0)
		expect(input.selectionEnd).toBe(6)
	})

	it('submits the edited filename', async () => {
		const rename = createTitle()
		await wrapper.get('button').trigger('click')
		await wrapper.get('input').setValue('new report.pdf')
		await wrapper.get('form').trigger('submit')
		await flushPromises()
		expect(rename).toHaveBeenCalledWith('new report.pdf')
		expect(wrapper.find('input').exists()).toBe(false)
	})

	it('cancels on Escape without propagating to the modal', async () => {
		const rename = createTitle()
		const keydown = vi.fn()
		document.addEventListener('keydown', keydown)
		await wrapper.get('button').trigger('click')
		await wrapper.get('input').setValue('cancel.pdf')
		await wrapper.get('input').trigger('keydown', { key: 'Escape' })
		await flushPromises()
		expect(rename).not.toHaveBeenCalled()
		expect(keydown).not.toHaveBeenCalled()
		expect(document.activeElement).toBe(wrapper.get('button').element)
		document.removeEventListener('keydown', keydown)
	})

	it('cancels on blur and skips unchanged names', async () => {
		const rename = createTitle()
		await wrapper.get('button').trigger('click')
		await wrapper.get('input').trigger('blur')
		expect(wrapper.find('input').exists()).toBe(false)
		await wrapper.get('button').trigger('click')
		await wrapper.get('form').trigger('submit')
		await flushPromises()
		expect(rename).not.toHaveBeenCalled()
		expect(document.activeElement).toBe(wrapper.get('button').element)
	})

	it('retains the draft and displays conflicts', async () => {
		createTitle(vi.fn().mockRejectedValue({ response: { status: 412 } }))
		await wrapper.get('button').trigger('click')
		await wrapper.get('input').setValue('existing.pdf')
		await wrapper.get('form').trigger('submit')
		await flushPromises()
		expect(showError).toHaveBeenCalledWith('A file with this name already exists.')
		expect(wrapper.get('input').element.value).toBe('existing.pdf')
		expect(document.activeElement).toBe(wrapper.get('input').element)
	})

	it('prevents duplicate submissions while a rename is pending', async () => {
		let resolve
		const rename = createTitle(vi.fn(() => new Promise((done) => {
			resolve = done
		})))
		await wrapper.get('button').trigger('click')
		await wrapper.get('input').setValue('new.pdf')
		await wrapper.get('form').trigger('submit')
		await wrapper.get('form').trigger('submit')
		expect(wrapper.get('input').element.disabled).toBe(true)
		expect(rename).toHaveBeenCalledTimes(1)
		resolve()
		await flushPromises()
	})
})
