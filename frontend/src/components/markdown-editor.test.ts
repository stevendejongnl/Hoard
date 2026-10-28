import { afterEach, describe, expect, it, vi } from 'vitest'
import './markdown-editor'
import type { MarkdownEditor } from './markdown-editor'

class FakeNotesStore {
  savedNotes: string[] = []
  shouldFail = false

  saveNotes = async (notes: string) => {
    if (this.shouldFail) throw new Error('500 Internal Server Error')
    this.savedNotes.push(notes)
  }
}

const mountedEditors: MarkdownEditor[] = []

async function mountEditor(store: FakeNotesStore, value: string): Promise<MarkdownEditor> {
  const editor = document.createElement('markdown-editor') as MarkdownEditor
  editor.value = value
  editor.saveNotes = store.saveNotes
  document.body.appendChild(editor)
  mountedEditors.push(editor)
  await editor.updateComplete
  return editor
}

function findButton(editor: MarkdownEditor, label: string): HTMLButtonElement {
  const buttons = [...editor.querySelectorAll('button')]
  return buttons.find((button) => button.textContent?.trim() === label) as HTMLButtonElement
}

async function startEditing(editor: MarkdownEditor): Promise<HTMLTextAreaElement> {
  findButton(editor, 'Edit').click()
  await editor.updateComplete
  return editor.querySelector('textarea') as HTMLTextAreaElement
}

async function typeNotes(editor: MarkdownEditor, textarea: HTMLTextAreaElement, text: string): Promise<void> {
  textarea.value = text
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await editor.updateComplete
}

afterEach(() => {
  mountedEditors.splice(0).forEach((editor) => editor.remove())
})

describe('markdown-editor', () => {
  it('shows the notes as rendered markdown', async () => {
    const editor = await mountEditor(new FakeNotesStore(), 'Print with **0.2 mm** layers')
    expect(editor.querySelector('.notes-text strong')?.textContent).toBe('0.2 mm')
  })

  it('says there are no notes yet when the notes are empty', async () => {
    const editor = await mountEditor(new FakeNotesStore(), '')
    expect(editor.querySelector('.notes-text')?.textContent).toContain('No notes yet')
  })

  it('shows an edit button and no text field until editing starts', async () => {
    const editor = await mountEditor(new FakeNotesStore(), 'Notes')
    expect(findButton(editor, 'Edit')).toBeDefined()
    expect(editor.querySelector('textarea')).toBeNull()
  })

  it('edits the notes in a text field that starts with the current notes', async () => {
    const editor = await mountEditor(new FakeNotesStore(), 'Old notes')
    const textarea = await startEditing(editor)
    expect(textarea.value).toBe('Old notes')
    expect(findButton(editor, 'Save')).toBeDefined()
    expect(findButton(editor, 'Edit')).toBeUndefined()
  })

  it('saves the draft, shows it rendered and reports the change', async () => {
    const store = new FakeNotesStore()
    const editor = await mountEditor(store, 'Old notes')
    const changes: string[] = []
    editor.addEventListener('notes-changed', (event) => changes.push((event as CustomEvent).detail.value))
    const textarea = await startEditing(editor)
    await typeNotes(editor, textarea, '# New title')
    findButton(editor, 'Save').click()
    await vi.waitFor(() => expect(editor.querySelector('textarea')).toBeNull())
    expect(store.savedNotes).toEqual(['# New title'])
    expect(changes).toEqual(['# New title'])
    expect(editor.querySelector('.notes-text h1')?.textContent).toBe('New title')
  })

  it('throws the draft away when cancelled', async () => {
    const store = new FakeNotesStore()
    const editor = await mountEditor(store, 'Old notes')
    const textarea = await startEditing(editor)
    await typeNotes(editor, textarea, 'Something else')
    findButton(editor, 'Cancel').click()
    await editor.updateComplete
    expect(store.savedNotes).toEqual([])
    expect(editor.querySelector('.notes-text')?.textContent).toContain('Old notes')
  })

  it('keeps editing and shows an error when saving fails', async () => {
    const store = new FakeNotesStore()
    store.shouldFail = true
    const editor = await mountEditor(store, 'Old notes')
    const textarea = await startEditing(editor)
    await typeNotes(editor, textarea, 'Draft')
    findButton(editor, 'Save').click()
    await vi.waitFor(() => expect(editor.querySelector('.notes-error')?.textContent).toContain('Could not save'))
    expect((editor.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Draft')
  })
})
