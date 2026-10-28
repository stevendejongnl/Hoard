export interface TemperatureSample {
  age_seconds: number
  hotend_actual: number
  hotend_target: number
  bed_actual: number
  bed_target: number
}

export interface TemperatureChartLayout {
  left: number
  right: number
  /** the y of zero degrees */
  bottom: number
  /** the y of the maximum temperature */
  top: number
  /** the y of the time labels */
  labelBaseline: number
  maximumTemperature: number
  windowSeconds: number
}

export interface TemperatureTick {
  label: string
  y: number
}

export interface TimeTick {
  label: string
  x: number
  anchor: 'start' | 'middle' | 'end'
}

export interface TemperatureChart {
  temperatureTicks: TemperatureTick[]
  timeTicks: TimeTick[]
  hotendLine: string
  bedLine: string
  hotendTargetLine: string
  bedTargetLine: string
}

const TEMPERATURE_STEP = 50
const TIME_STEP_SECONDS = 120
const SECONDS_PER_MINUTE = 60
const LINE_DECIMALS = 1

function isExactlyBetweenTenths(value: number): boolean {
  return Number.isInteger(value * 20) && !Number.isInteger(value * 10)
}

/** Writes a coordinate with one decimal; an exact tie goes to the even tenth, as the design's numbers do. */
function formatCoordinate(value: number): string {
  if (!isExactlyBetweenTenths(value)) return value.toFixed(LINE_DECIMALS)
  const lowerTenth = Math.floor(value * 10)
  const evenTenth = lowerTenth % 2 === 0 ? lowerTenth : lowerTenth + 1
  return (evenTenth / 10).toFixed(LINE_DECIMALS)
}

function formatPoint(x: number, y: number): string {
  return `${formatCoordinate(x)},${formatCoordinate(y)}`
}

function createScale(layout: TemperatureChartLayout) {
  const readX = (ageSeconds: number) =>
    layout.left + ((layout.windowSeconds - ageSeconds) / layout.windowSeconds) * (layout.right - layout.left)
  const readY = (temperature: number) =>
    layout.bottom - ((layout.bottom - layout.top) * temperature) / layout.maximumTemperature
  return { readX, readY }
}

function listTemperatureTicks(layout: TemperatureChartLayout, readY: (temperature: number) => number) {
  const ticks: TemperatureTick[] = []
  for (let temperature = 0; temperature <= layout.maximumTemperature; temperature += TEMPERATURE_STEP) {
    ticks.push({ label: String(temperature), y: readY(temperature) })
  }
  return ticks
}

function pickAnchor(ageSeconds: number, windowSeconds: number): TimeTick['anchor'] {
  if (ageSeconds === windowSeconds) return 'start'
  return ageSeconds === 0 ? 'end' : 'middle'
}

function describeAge(ageSeconds: number): string {
  return ageSeconds === 0 ? 'now' : `-${ageSeconds / SECONDS_PER_MINUTE}m`
}

function listTimeTicks(layout: TemperatureChartLayout, readX: (ageSeconds: number) => number): TimeTick[] {
  const ticks: TimeTick[] = []
  for (let age = layout.windowSeconds; age >= 0; age -= TIME_STEP_SECONDS) {
    ticks.push({ label: describeAge(age), x: readX(age), anchor: pickAnchor(age, layout.windowSeconds) })
  }
  return ticks
}

function buildLine(
  samples: TemperatureSample[],
  readX: (ageSeconds: number) => number,
  readValue: (sample: TemperatureSample) => number,
): string {
  return samples.map((sample) => formatPoint(readX(sample.age_seconds), readValue(sample))).join(' ')
}

function buildStepLine(
  samples: TemperatureSample[],
  readX: (ageSeconds: number) => number,
  readValue: (sample: TemperatureSample) => number,
): string {
  if (samples.length === 0) return ''
  const points = [formatPoint(readX(samples[0].age_seconds), readValue(samples[0]))]
  for (let index = 1; index < samples.length; index += 1) {
    const x = readX(samples[index].age_seconds)
    if (readValue(samples[index]) === readValue(samples[index - 1])) continue
    points.push(formatPoint(x, readValue(samples[index - 1])), formatPoint(x, readValue(samples[index])))
  }
  const last = samples[samples.length - 1]
  points.push(formatPoint(readX(last.age_seconds), readValue(last)))
  return points.join(' ')
}

export function buildTemperatureChart(samples: TemperatureSample[], layout: TemperatureChartLayout): TemperatureChart {
  const { readX, readY } = createScale(layout)
  return {
    temperatureTicks: listTemperatureTicks(layout, readY),
    timeTicks: listTimeTicks(layout, readX),
    hotendLine: buildLine(samples, readX, (sample) => readY(sample.hotend_actual)),
    bedLine: buildLine(samples, readX, (sample) => readY(sample.bed_actual)),
    hotendTargetLine: buildStepLine(samples, readX, (sample) => readY(sample.hotend_target)),
    bedTargetLine: buildStepLine(samples, readX, (sample) => readY(sample.bed_target)),
  }
}
