const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric"
})

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
})

const FULL_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true
})

export const formatDateTime = (timestamp) => {
  if (!timestamp) return ""
  return FULL_FORMATTER.format(new Date(timestamp))
}

export const formatDate = (timestamp) => {
  if (!timestamp) return ""
  return DATE_FORMATTER.format(new Date(timestamp))
}

export const formatTime = (timestamp) => {
  if (!timestamp) return ""
  return TIME_FORMATTER.format(new Date(timestamp))
}

export const formatOrderDate = (timestamp) => {
  if (!timestamp) return ""
  return DATE_FORMATTER.format(new Date(timestamp))
}

export const formatOrderTime = (timestamp) => {
  if (!timestamp) return ""
  return TIME_FORMATTER.format(new Date(timestamp))
}

export const formatOrderDateTime = (timestamp) => {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  return `${DATE_FORMATTER.format(d)}  ${TIME_FORMATTER.format(d)}`
}