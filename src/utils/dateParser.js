/**
 * Date parsing utility for extracting dates from natural language text
 * Used to convert memory content into calendar events
 */

/**
 * Extract dates from text and return structured date information
 * Supports formats: MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD, natural language dates
 */
const extractDatesFromText = (text) => {
  if (!text) return [];
  
  const dates = [];
  const lowerText = text.toLowerCase();
  
  // Pattern 1: MM/DD/YY or MM/DD/YYYY
  const slashDatePattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
  let match;
  while ((match = slashDatePattern.exec(text)) !== null) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    let year = parseInt(match[3]);
    
    // Convert 2-digit year to 4-digit
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    // Validate date
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dates.push({
        date: dateStr,
        originalText: match[0],
        format: 'slash'
      });
    }
  }
  
  // Pattern 2: YYYY-MM-DD
  const isoDatePattern = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((match = isoDatePattern.exec(text)) !== null) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push({
        date: match[0],
        originalText: match[0],
        format: 'iso'
      });
    }
  }
  
  // Pattern 3: Month DD, YYYY or Month DD (e.g., "January 15, 2026" or "Jan 15")
  const monthNames = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9, 'sept': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12
  };
  
  const monthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/gi;
  while ((match = monthPattern.exec(text)) !== null) {
    const monthName = match[1].toLowerCase();
    const month = monthNames[monthName];
    const day = parseInt(match[2]);
    const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
    
    if (month && day >= 1 && day <= 31) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dates.push({
        date: dateStr,
        originalText: match[0],
        format: 'natural'
      });
    }
  }
  
  return dates;
};

/**
 * Extract event title from memory content
 * Tries to create a concise title from the memory text
 */
const extractEventTitle = (content, dateInfo) => {
  if (!content) return 'Event';
  
  // Remove the date from content to get cleaner title
  let cleanContent = content.replace(dateInfo.originalText, '').trim();
  
  // Common patterns for event descriptions
  const patterns = [
    /(?:i'm|i am|im)\s+(.+?)(?:\s+on|\s+at|$)/i,
    /(?:meeting|meet)\s+(?:with|up with)?\s*(.+?)(?:\s+on|\s+at|$)/i,
    /(?:appointment|call|conference)\s+(?:with)?\s*(.+?)(?:\s+on|\s+at|$)/i,
    /(.+?)(?:\s+on|\s+at|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanContent.match(pattern);
    if (match && match[1]) {
      let title = match[1].trim();
      // Capitalize first letter
      title = title.charAt(0).toUpperCase() + title.slice(1);
      // Limit length
      if (title.length > 50) {
        title = title.substring(0, 47) + '...';
      }
      return title;
    }
  }
  
  // Fallback: use first 50 chars of clean content
  if (cleanContent.length > 50) {
    return cleanContent.substring(0, 47) + '...';
  }
  return cleanContent || 'Event';
};

/**
 * Convert memory to calendar event(s)
 * A single memory can contain multiple dates
 */
const memoryToCalendarEvents = (memory) => {
  const events = [];
  const dates = extractDatesFromText(memory.content);
  
  if (dates.length === 0) {
    return events;
  }
  
  // Create an event for each date found
  dates.forEach(dateInfo => {
    const title = extractEventTitle(memory.content, dateInfo);
    
    events.push({
      id: `memory-${memory.id}-${dateInfo.date}`,
      memoryId: memory.id,
      title: title,
      date: dateInfo.date,
      time: null, // Could extract time if needed
      source: 'memory',
      content: memory.content,
      tags: memory.tags || []
    });
  });
  
  return events;
};

/**
 * Get all calendar events from memories
 */
const getCalendarEventsFromMemories = (memories) => {
  const events = [];
  
  memories.forEach(memory => {
    const memoryEvents = memoryToCalendarEvents(memory);
    events.push(...memoryEvents);
  });
  
  // Sort by date
  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return events;
};

module.exports = {
  extractDatesFromText,
  extractEventTitle,
  memoryToCalendarEvents,
  getCalendarEventsFromMemories
};
