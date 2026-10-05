<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->
<template>
	<form
		v-if="editing"
		class="files-pdfviewer__rename"
		@submit.prevent="save"
		@keydown.stop
		@keyup.stop
		@click.stop>
		<input
			ref="input"
			v-model="draft"
			:aria-label="t('files_pdfviewer', 'Filename')"
			:disabled="saving"
			type="text"
			@keydown.esc.prevent="cancel(true)"
			@blur="cancel()">
	</form>
	<button
		v-else
		ref="button"
		type="button"
		class="files-pdfviewer__filename"
		:title="t('files_pdfviewer', 'Rename file')"
		:aria-label="t('files_pdfviewer', 'Rename file: {name}', { name: filename })"
		@click.stop="edit">
		{{ filename }}
	</button>
</template>

<script>
import { showError } from '@nextcloud/dialogs'
import { translate as t } from '@nextcloud/l10n'

export default {
	name: 'FilenameTitle',
	props: {
		filename: { type: String, required: true },
		rename: { type: Function, required: true },
	},

	data: () => ({ editing: false, saving: false, draft: '' }),
	methods: {
		t,
		async edit() {
			this.draft = this.filename
			this.editing = true
			await this.$nextTick()
			this.$refs.input.focus()
			const dot = this.draft.lastIndexOf('.')
			this.$refs.input.setSelectionRange(0, dot > 0 ? dot : this.draft.length)
		},

		async cancel(restoreFocus = false) {
			if (!this.saving) {
				this.editing = false
				if (restoreFocus) {
					await this.$nextTick()
					this.$refs.button?.focus()
				}
			}
		},

		async save() {
			if (this.saving) {
				return
			}
			if (this.draft === this.filename) {
				this.cancel(true)
				return
			}
			this.saving = true
			try {
				await this.rename(this.draft)
				this.editing = false
			} catch (error) {
				showError(error.response?.status === 412
					? t('files_pdfviewer', 'A file with this name already exists.')
					: error.response
						? t('files_pdfviewer', 'Could not rename the file.')
						: error.message || t('files_pdfviewer', 'Could not rename the file.'))
			} finally {
				this.saving = false
				await this.$nextTick()
				this.$refs.input?.focus()
			}
		},
	},
}
</script>
