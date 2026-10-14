// Keep real URLs available to crawlers, keyboard users and new-tab navigation.
export function SiteLink({ href, navigate, onClick, children, ...props }) {
  return <a href={href} {...props} onClick={(event) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(href)
  }}>{children}</a>
}
