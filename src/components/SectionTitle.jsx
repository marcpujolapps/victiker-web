export function SectionTitle({ eyebrow, title, copy, dark = false }) {
  return (
    <div className={`section-title ${dark ? 'section-title--dark' : ''}`}>
      {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {copy && <p>{copy}</p>}
    </div>
  )
}
