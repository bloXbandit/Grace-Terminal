# Calendar Event Generation - Feature Status & Issues

**Date:** January 4, 2026  
**Status:** Partially Implemented - UI Display Issues Remain

---

## 🎯 Feature Goal

Automatically extract dates from user memories and display them as calendar events in the My Assistant page. When users save memories with dates (e.g., "I have a meeting on 1/24/26"), those dates should:
1. Be parsed and extracted from the memory content
2. Populate the calendar UI with event dots on relevant dates
3. Show event details when dates are selected

---

## ✅ What's Working

### Backend (100% Functional)
- **Date Parser** (`src/utils/dateParser.js`): Successfully extracts dates and event titles from natural language
- **Calendar API** (`/api/assistant/calendar/events`): Returns all calendar events from memories
- **Database Integration**: Memories with dates are stored and retrieved correctly
- **API Response**: Returns 8 events with correct date formatting (YYYY-MM-DD)

**Verified Events in Database:**
```
1988-05-26 - Sister Kathleen's birthday
2026-01-03 - Test memory
2026-01-15 - Project kickoff meeting
2026-01-22 - Meeting with Brenda Fields
2026-01-24 - Mortgage applicant call (2 entries)
2026-03-15 - Dentist appointment
2026-04-20 - Doctor appointment
```

### Frontend (Partially Working)
- **API Call**: Frontend now successfully calls `/api/assistant/calendar/events` on page mount
- **Data Fetch**: API response is received with all 8 events
- **Reactive State**: `calendarEvents.value` is populated with event data

---

## ❌ What's NOT Working

### UI Display Issue
**Problem:** Despite the frontend receiving calendar event data, the events do NOT display in the UI:
- No blue dots appear on calendar dates with events
- "No events scheduled" message persists even when navigating to dates with events
- The `selectedDateEvents` computed property returns empty arrays

### Why Logging Doesn't Reveal the True Issue

**The Debugging Challenge:**
1. **Console logs are client-side** - They appear in the browser console, not backend logs
2. **Backend logs only show API calls** - They confirm the API is hit and returns data, but can't see what happens to that data in Vue
3. **Reactive state mystery** - We can confirm `calendarEvents.value = calData.events` executes, but can't verify if Vue's reactivity system properly updates the UI
4. **Template rendering black box** - The template uses computed properties (`selectedDateEvents`, `getEventsForDate`) but we can't see if they're being called or what they return
5. **Build/cache issues** - Even after rebuilding, browser cache or service workers might serve stale code

**What We Can't See:**
- Whether `calendarEvents.value` actually contains data after assignment
- Whether computed properties are recalculating when `calendarEvents` changes
- Whether the template is re-rendering when data changes
- Whether there's a timing issue (data loads after template renders)
- Whether there's a Vue reactivity issue (ref not triggering updates)

**Why Standard Logging Fails:**
- Backend logs: Only show "GET /api/assistant/calendar/events - 62ms" ✅
- Frontend logs in onMounted: Show "[Calendar] Loaded 8 events" ✅
- But we can't see: What happens AFTER the assignment, whether the UI updates, or why computed properties return empty

---

## 📝 All Code Additions for Calendar Feature

### 1. Backend - Date Parser Utility
**File:** `src/utils/dateParser.js`
**Purpose:** Extract dates and event titles from natural language text

**Key Functions:**
- `extractDatesFromText(text)` - Finds dates in various formats (1/24/26, Jan 24, etc.)
- `extractEventTitle(content, dateInfo)` - Extracts event description from memory content
- `getCalendarEventsFromMemories(memories)` - Processes all memories and returns calendar events

**Status:** ✅ Fully functional, tested, working correctly

---

### 2. Backend - Calendar API Endpoint
**File:** `src/routers/assistant/assistant.js`
**Lines:** 206-245

```javascript
router.get("/calendar/events", async (ctx) => {
  // Fetches all user memories
  // Calls getCalendarEventsFromMemories() to extract dates
  // Returns { success: true, count: N, events: [...] }
})
```

**Status:** ✅ Fully functional, returns correct data

---

### 3. Frontend - Calendar UI Component
**File:** `frontend/src/view/assistant/index.vue`

#### Added Reactive State (Lines 322-324):
```javascript
const calendarConnected = ref(false)
const calendarDate = ref(dayjs())
const calendarEvents = ref([])  // ⚠️ This should hold events but UI doesn't reflect it
```

#### Added Computed Properties (Lines 326-333):
```javascript
const selectedDateLabel = computed(() => {
  return calendarDate.value.format('MMMM D, YYYY')
})

const selectedDateEvents = computed(() => {
  const dateStr = calendarDate.value.format('YYYY-MM-DD')
  return calendarEvents.value.filter(e => e.date === dateStr)
})
```
**Issue:** `selectedDateEvents` returns empty even when `calendarEvents` should have data

#### Added Helper Function (Lines 335-342):
```javascript
const getEventsForDate = (date) => {
  const dateStr = dayjs(date).format('YYYY-MM-DD')
  const events = calendarEvents.value.filter(e => e.date === dateStr)
  if (events.length > 0) {
    console.log(`[Calendar] Events for ${dateStr}:`, events)
  }
  return events
}
```
**Issue:** This function is called by the template for each calendar date cell, but never logs anything (suggesting it returns empty)

#### Modified onMounted (Lines 250-269):
**Original (NOT WORKING):**
```javascript
onMounted(() => {
  window.addEventListener('resize', handleResize)
  loadMemories()
  loadCalendarEvents()  // ⚠️ This function wasn't executing
  refreshNews()
})
```

**Current (PARTIALLY WORKING):**
```javascript
onMounted(async () => {
  console.log('[Assistant] Component mounted')
  window.addEventListener('resize', handleResize)
  
  try {
    await loadMemories()
    
    // Call calendar API directly - loadCalendarEvents() wasn't executing
    const calRes = await fetch('/api/assistant/calendar/events')
    const calData = await calRes.json()
    if (calData.success) {
      calendarEvents.value = calData.events || []
      console.log(`[Calendar] Loaded ${calendarEvents.value.length} events`)
    }
    
    await refreshNews()
  } catch (error) {
    console.error('[Assistant] Error during mount:', error)
  }
})
```
**Status:** API call works, data is fetched, but UI doesn't update

#### Added loadCalendarEvents Function (Lines 397-432):
```javascript
const loadCalendarEvents = async (showNotification = false) => {
  // Fetches calendar events
  // Compares with previous events
  // Shows notifications for added/removed events
}
```
**Status:** ⚠️ This function exists but was NOT being called from onMounted (mystery issue). Now bypassed by direct API call in onMounted.

#### Template Changes (Lines 56-86):
```vue
<div class="panel calendar-panel">
  <a-calendar v-model:value="calendarDate" :fullscreen="false" @select="onDateSelect">
    <template #dateCellRender="{ current }">
      <!-- Blue dot should appear if getEventsForDate(current).length > 0 -->
      <div v-if="getEventsForDate(current).length" class="calendar-events-dot"></div>
    </template>
  </a-calendar>
  
  <div class="calendar-events">
    <h4>{{ selectedDateLabel }}</h4>
    <!-- Shows "No events scheduled" if selectedDateEvents.length === 0 -->
    <div v-if="selectedDateEvents.length === 0" class="no-events">
      <p>No events scheduled</p>
    </div>
    <!-- Should show events list if selectedDateEvents has items -->
    <a-list v-else :data-source="selectedDateEvents" size="small">
      <template #renderItem="{ item }">
        <a-list-item>
          <a-list-item-meta :title="item.title" :description="item.time" />
        </a-list-item>
      </template>
    </a-list>
  </div>
</div>
```
**Status:** ⚠️ Template is correct, but computed properties return empty so "No events scheduled" always shows

---

## 🧹 Code That Needs Cleanup

### 1. Duplicate/Unused loadCalendarEvents Function
**Location:** `frontend/src/view/assistant/index.vue:397-432`

**Issue:** This function is defined but NOT called from `onMounted` anymore (we bypassed it with direct API call). It's still called from:
- `deleteMemory()` - Line 467: `await loadCalendarEvents(true)`
- `saveNewMemory()` - Line 499: `await loadCalendarEvents(true)`

**Decision Needed:**
- **Option A:** Remove the function entirely and replace those two calls with direct API fetch
- **Option B:** Fix whatever was preventing the function from executing and use it everywhere
- **Option C:** Keep both (direct call in onMounted, function for refresh scenarios)

### 2. Debug Console Logs
**Locations:**
- `frontend/src/view/assistant/index.vue:251` - `console.log('[Assistant] Component mounted')`
- `frontend/src/view/assistant/index.vue:262` - `console.log('[Calendar] Loaded ${calendarEvents.value.length} events')`
- `frontend/src/view/assistant/index.vue:339` - `console.log('[Calendar] Events for ${dateStr}:', events)`
- `src/utils/dateParser.js` - Multiple debug logs

**Action:** Remove or convert to proper logging system once feature is stable

### 3. Unused Calendar Connection Feature
**Location:** `frontend/src/view/assistant/index.vue:322, 348-353`

```javascript
const calendarConnected = ref(false)
const connectCalendar = async () => {
  message.info('Google Calendar connection coming soon!')
  // TODO: Implement OAuth flow
}
```

**Status:** Placeholder for future Google Calendar integration, not currently used

---

## 🔍 Root Cause Hypothesis

**Most Likely Issue:** Vue Reactivity Problem

The data flow works perfectly until the final step:
1. ✅ API returns correct data
2. ✅ `calendarEvents.value = calData.events` executes
3. ❌ Vue doesn't detect the change or doesn't trigger computed property recalculation
4. ❌ Template doesn't re-render with new data

**Possible Causes:**
1. **Timing Issue:** Data loads after template has already rendered and Vue doesn't re-render
2. **Ref Issue:** `calendarEvents` ref might not be properly reactive
3. **Computed Property Issue:** `selectedDateEvents` might not be watching `calendarEvents` correctly
4. **Template Issue:** `v-if="getEventsForDate(current).length"` might be evaluated once and cached
5. **Build/Cache Issue:** Browser is serving old compiled code despite rebuild

**Why We Can't Confirm:**
- Can't add breakpoints to compiled production build
- Console logs in computed properties might not fire if they're not being called
- Vue DevTools would show the reactive state, but requires browser access

---

## 🎯 Recommended Next Steps (If Resuming)

1. **Add Vue DevTools inspection** - Check if `calendarEvents` ref actually contains data in browser
2. **Add watchers** - Watch `calendarEvents` and log when it changes
3. **Simplify template** - Test with `{{ calendarEvents.length }}` directly in template to confirm reactivity
4. **Force re-render** - Try `nextTick()` or force component key change after data load
5. **Check Ant Design Calendar** - Verify if `a-calendar` component has reactivity issues with custom cell renders
6. **Test with static data** - Hardcode events in `calendarEvents` initialization to isolate data loading from rendering

---

## 📊 Summary

**Backend:** 100% Complete ✅  
**Frontend Data Fetch:** 100% Complete ✅  
**Frontend UI Display:** 0% Working ❌  

**The Mystery:** Data successfully travels from database → API → frontend fetch → reactive state assignment, but the Vue template never reflects the changes. Standard logging cannot reveal why because the issue is in Vue's reactivity/rendering layer, which requires browser-based debugging tools to diagnose.

**Workaround Attempted:** Bypassed `loadCalendarEvents()` function with direct API call in `onMounted` - this fixed the API call issue but did NOT fix the UI display issue.

**Current State:** Feature is non-functional from user perspective despite all underlying systems working correctly.
