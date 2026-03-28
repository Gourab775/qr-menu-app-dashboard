export const formatDateTime = (timestamp) => {
  if (!timestamp) return "";

  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  return formatter.format(new Date(timestamp));
};

export const formatDate = (timestamp) => {
  if (!timestamp) return "";
  
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return formatter.format(new Date(timestamp));
};

export const formatTime = (timestamp) => {
  if (!timestamp) return "";
  
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  return formatter.format(new Date(timestamp));
};