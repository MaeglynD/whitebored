// Synthetic documentation fixtures. Only imported by the isolated capture browser.
import {
  createTLStore,
  getSnapshot,
  toRichText,
  getIndexAbove,
  b64Vecs,
  type TLShape,
  type IndexKey,
} from 'tldraw'
import { storeShapeUtils } from '../src/canvasConfig'
import { createBoard } from '../src/storage'

export async function seedDemo() {
  function scene() {
    const store = createTLStore({ shapeUtils: storeShapeUtils })
    store.ensureStoreIsUsable()
    const page = store.allRecords().find((r) => r.typeName === 'page')!
    let index = 'a1' as IndexKey
    let count = 0
    const add = (type: string, x: number, y: number, props: unknown, meta = {}) => {
      index = getIndexAbove(index)
      store.put([
        {
          id: `shape:demo-${++count}`,
          typeName: 'shape',
          type,
          x,
          y,
          rotation: 0,
          index,
          parentId: page.id,
          isLocked: false,
          opacity: 1,
          meta,
          props,
        } as TLShape,
      ])
    }
    const text = (
      value: string,
      x: number,
      y: number,
      w = 350,
      color = 'black',
      size = 'm',
      scale = 1,
      font = 'sans',
    ) =>
      add('text', x, y, {
        color,
        size,
        w,
        font,
        textAlign: 'start',
        autoSize: false,
        scale,
        richText: toRichText(value),
      })
    const ink = (points: number[][], color = 'black', width = 2) => {
      const [x, y] = points[0]
      const dense = [{ x: 0, y: 0 }]
      for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1],
          [bx, by] = points[i]
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 5))
        for (let j = 1; j <= steps; j++)
          dense.push({ x: ax + ((bx - ax) * j) / steps - x, y: ay + ((by - ay) * j) / steps - y })
      }
      add(
        'draw',
        x,
        y,
        {
          color,
          fill: 'none',
          dash: 'draw',
          size: 's',
          isComplete: true,
          isClosed: false,
          isPen: false,
          scale: 1,
          scaleX: 1,
          scaleY: 1,
          segments: [{ type: 'free', dim: 2, path: b64Vecs.encodePoints(dense, 2) }],
        },
        { folioWidth: width },
      )
    }
    const box = (x: number, y: number, w: number, h: number, color = 'grey') =>
      ink(
        [
          [x, y + 2],
          [x + w * 0.48, y],
          [x + w, y + 1],
          [x + w + 1, y + h * 0.6],
          [x + w - 1, y + h],
          [x + w * 0.4, y + h + 2],
          [x - 1, y + h],
          [x, y + 2],
        ],
        color,
      )
    const circle = (x: number, y: number, r: number, color = 'green') =>
      ink(
        Array.from({ length: 49 }, (_, i) => [
          x + Math.cos((i / 48) * Math.PI * 2) * r,
          y + Math.sin((i / 48) * Math.PI * 2) * r,
        ]),
        color,
      )
    return { store, text, ink, box, circle }
  }
  const a = scene()
  a.text('HOME / STUDIO', 100, 90, 400, 'blue', 's', 0.72)
  a.text('Reading corner', 97, 132, 600, 'black', 'xl', 1.13)
  a.text('01   THE IDEA', 101, 255, 340, 'blue', 's', 0.72)
  a.text(
    'Morning light.\nA low shelf for books.\nOne comfortable chair.',
    100,
    293,
    300,
    'black',
    'm',
    0.95,
  )
  a.text('02   TO FIND', 101, 453, 340, 'blue', 's', 0.72)
  a.text('Linen shade\nOak side table\nSomething green', 133, 490, 285, 'black', 'm', 0.88)
  for (const y of [506, 536, 566]) a.circle(110, y, 5, 'grey')
  a.text('less furniture, more room', 96, 673, 450, 'green', 'm', 0.95, 'draw')
  a.ink(
    [
      [102, 711],
      [190, 714],
      [282, 711],
      [373, 714],
    ],
    'green',
    1.5,
  )
  a.ink(
    [
      [496, 576],
      [493, 393],
      [496, 229],
      [668, 227],
    ],
    'grey',
    2.5,
  )
  a.ink(
    [
      [838, 228],
      [953, 229],
      [951, 416],
      [954, 576],
      [697, 577],
    ],
    'grey',
    2.5,
  )
  a.ink(
    [
      [496, 576],
      [566, 577],
    ],
    'grey',
    2.5,
  )
  a.ink(
    [
      [672, 224],
      [750, 226],
      [833, 225],
    ],
    'blue',
    3,
  )
  a.ink(
    [
      [672, 233],
      [750, 235],
      [833, 233],
    ],
    'blue',
    1.5,
  )
  a.text('morning light', 680, 174, 230, 'blue', 'm', 0.82, 'draw')
  a.box(520, 265, 30, 179)
  for (let i = 0; i < 6; i++)
    a.ink(
      [
        [527, 283 + i * 26],
        [543, 284 + i * 26],
      ],
      'grey',
      1.3,
    )
  a.box(650, 365, 119, 124, 'orange')
  a.box(662, 379, 94, 83, 'orange')
  a.ink(
    [
      [650, 462],
      [710, 465],
      [769, 463],
    ],
    'orange',
    1.7,
  )
  a.circle(830, 422, 31, 'orange')
  a.circle(830, 422, 7, 'orange')
  a.circle(901, 520, 26, 'green')
  a.ink(
    [
      [900, 533],
      [899, 508],
      [889, 493],
      [887, 509],
      [900, 518],
      [914, 500],
      [918, 519],
      [902, 526],
    ],
    'green',
    2.1,
  )
  a.ink(
    [
      [571, 578],
      [574, 555],
      [587, 531],
      [610, 513],
      [638, 505],
    ],
    'grey',
    1.2,
  )
  a.ink(
    [
      [638, 505],
      [642, 577],
    ],
    'grey',
    1.8,
  )
  a.text('leave the doorway open', 561, 632, 440, 'orange', 'm', 0.88, 'draw')
  a.ink(
    [
      [601, 629],
      [586, 613],
      [586, 590],
    ],
    'orange',
    1.6,
  )
  a.ink(
    [
      [580, 599],
      [586, 590],
      [592, 599],
    ],
    'orange',
    1.6,
  )
  const reading = await createBoard('Reading corner', 'Home', getSnapshot(a.store))

  const b = scene()
  b.text('THIS WEEK', 100, 100, 400, 'green', 's', 0.72)
  b.text('Small projects', 97, 141, 600, 'black', 'xl', 1.1)
  for (const [x, title, color, notes] of [
    [100, 'Explore', 'blue', 'A better reading light\nWeekend walking routes'],
    [420, 'Make', 'orange', 'Sketch the room\nBuild a short reading list'],
    [740, 'Done', 'green', 'Measure the corner\nFind the morning light'],
  ] as const) {
    b.text(title, x, 295, 280, color, 'l')
    b.ink(
      [
        [x, 347],
        [x + 246, 349],
      ],
      color,
      2,
    )
    b.text(notes, x, 378, 258, 'black', 'm', 0.88)
  }
  await createBoard('Small projects', 'Home', getSnapshot(b.store))
  const c = scene()
  c.text('READ / REMEMBER', 100, 100, 500, 'violet', 's', 0.72)
  c.text('Notes on attention', 97, 145, 750, 'black', 'xl', 1.1)
  c.text(
    'Keep one thing in view.\nLeave room in the margins.\nWrite it down before opening another tab.',
    100,
    283,
    680,
    'black',
    'l',
    1,
  )
  c.ink(
    [
      [104, 330],
      [246, 333],
      [376, 330],
    ],
    'violet',
    2,
  )
  await createBoard('Notes on attention', 'Reading', getSnapshot(c.store))
  localStorage.setItem('folio-active', reading.id)
  localStorage.setItem('folio-sidebar', 'open')
  localStorage.setItem('folio-board-sort', 'created-asc')
  localStorage.setItem('folio-preferences', JSON.stringify({ theme: 'light', grid: false }))
}
