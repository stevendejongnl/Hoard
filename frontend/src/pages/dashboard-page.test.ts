describe('file browser', () => {
  it('is closed until a part of the page asks for it', async () => {
    const { page } = await createPage()
    expect(page.querySelector('file-browser-modal')?.hasAttribute('open')).toBe(false)
  })

  it('opens when asked, and starts a print for a file chosen to print', async () => {
    const printed: string[] = []
    const { page } = await createPage({ startPrint: (filename) => void printed.push(filename) })
    page.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'print' }, bubbles: true }))
    await page.updateComplete
    const browser = page.querySelector('file-browser-modal')!
    expect(browser.hasAttribute('open')).toBe(true)
    browser.dispatchEvent(new CustomEvent('file-selected', { detail: { filename: 'blade.gcode' }, bubbles: true }))
    await page.updateComplete
    expect(printed).toEqual(['blade.gcode'])
  })

  it('hands a file chosen for the prediction to the cost predictor', async () => {
    const { page } = await createPage()
    const predictor = page.querySelector('cost-predictor-panel') as unknown as {
      chooseFile: (name: string) => Promise<void>
    }
    const chosen: string[] = []
    predictor.chooseFile = async (name) => void chosen.push(name)
    page.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'predict' }, bubbles: true }))
    await page.updateComplete
    page
      .querySelector('file-browser-modal')!
      .dispatchEvent(new CustomEvent('file-selected', { detail: { filename: 'blade.gcode' }, bubbles: true }))
    await page.updateComplete
    expect(chosen).toEqual(['blade.gcode'])
  })

  it('closes again when the browser closes', async () => {
    const { page } = await createPage()
    page.dispatchEvent(new CustomEvent('open-file-browser', { detail: { purpose: 'print' }, bubbles: true }))
    await page.updateComplete
    page.querySelector('file-browser-modal')!.dispatchEvent(new CustomEvent('close', { bubbles: true }))
    await page.updateComplete
    expect(page.querySelector('file-browser-modal')?.hasAttribute('open')).toBe(false)
  })
})
