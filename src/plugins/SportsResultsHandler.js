const { format } = require('date-fns');

const DEFAULT_TZ = 'America/New_York';

function getTzYMD(date, timeZone = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function tzNowDateUTC(timeZone = DEFAULT_TZ) {
  const { year, month, day } = getTzYMD(new Date(), timeZone);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function formatInTz(date, timeZone = DEFAULT_TZ, options = {}) {
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(date);
}

/**
 * Specialized handler for sports results that ensures clean, direct display in chat
 */
class SportsResultsHandler {
  constructor() {
    this.sportsPatterns = {
      nfl: /\b(nfl|nfl scores?|nfl results?|nfl games?|football scores?|football results?|football games?|monday night football|sunday night football|thursday night football|mnf|snf|tnf)\b/i,
      nba: /\b(nba|basketball|nba scores?|nba results?|nba games?)\b/i,
      mlb: /\b(mlb|baseball|mlb scores?|mlb results?|mlb games?)\b/i,
      nhl: /\b(nhl|hockey|nhl scores?|nhl results?|nhl games?)\b/i
    };
    
    this.sportsTitles = {
      nfl: 'NFL Football',
      nba: 'NBA Basketball',
      mlb: 'MLB Baseball',
      nhl: 'NHL Hockey'
    };
  }

  parseSportsIntent(query) {
    const lower = (query || '').toLowerCase();
    const intent = {
      wantPast: false,
      wantUpcoming: false,
      dayOfWeek: null,
      targetDate: null,
      dateRange: null
    };
    
    // Use America/New_York calendar date for all relative computations
    const now = tzNowDateUTC(DEFAULT_TZ);
    
    // Detect temporal phrases and compute target dates
    if (/\b(last|yesterday|previous|past|this past|that passed|that just passed|earlier this week|was)\b/.test(lower)) {
      intent.wantPast = true;
    }
    if (/\b(next week|next game|upcoming|tonight|later today)\b/.test(lower)) {
      intent.wantUpcoming = true;
    }
    
    // Specific day detection with relative computation
    if (/monday night|mnf\b|\bmonday\b/.test(lower)) {
      intent.dayOfWeek = 1; // Monday = 1
      if (/\b(last|previous)\b/.test(lower)) {
        intent.targetDate = this.getLastWeekday(now, 1);
      } else if (/\b(this)\b/.test(lower)) {
        intent.targetDate = this.getThisWeekday(now, 1);
      } else if (intent.wantPast) {
        // Default "Monday" with past tense to last Monday
        intent.targetDate = this.getLastWeekday(now, 1);
      }
    } else if (/sunday night|snf\b|\bsunday\b/.test(lower)) {
      intent.dayOfWeek = 0; // Sunday = 0
      if (/\b(last|previous)\b/.test(lower)) {
        intent.targetDate = this.getLastWeekday(now, 0);
      } else if (/\b(this)\b/.test(lower)) {
        intent.targetDate = this.getThisWeekday(now, 0);
      } else if (intent.wantPast) {
        intent.targetDate = this.getLastWeekday(now, 0);
      }
    } else if (/thursday night|tnf\b|\bthursday\b/.test(lower)) {
      intent.dayOfWeek = 4; // Thursday = 4
      if (/\b(last|previous)\b/.test(lower)) {
        intent.targetDate = this.getLastWeekday(now, 4);
      } else if (/\b(this)\b/.test(lower)) {
        intent.targetDate = this.getThisWeekday(now, 4);
      } else if (intent.wantPast) {
        intent.targetDate = this.getLastWeekday(now, 4);
      }
    }
    
    // Week-based detection
    if (/\blast week\b/.test(lower)) {
      const startOfLastWeek = this.getStartOfWeek(now, -1); // Last week
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setUTCDate(endOfLastWeek.getUTCDate() + 6); // Sunday
      intent.dateRange = { start: startOfLastWeek, end: endOfLastWeek };
    } else if (/\bthis week\b/.test(lower)) {
      const startOfThisWeek = this.getStartOfWeek(now, 0); // This week
      const endOfThisWeek = new Date(startOfThisWeek);
      endOfThisWeek.setUTCDate(endOfThisWeek.getUTCDate() + 6); // Sunday
      intent.dateRange = { start: startOfThisWeek, end: endOfThisWeek };
    } else if (/\bnext week\b/.test(lower)) {
      const startOfNextWeek = this.getStartOfWeek(now, 1); // Next week
      const endOfNextWeek = new Date(startOfNextWeek);
      endOfNextWeek.setUTCDate(endOfNextWeek.getUTCDate() + 6); // Sunday
      intent.dateRange = { start: startOfNextWeek, end: endOfNextWeek };
    }
    
    // Simple relative days
    if (/\byesterday\b/.test(lower)) {
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      intent.targetDate = yesterday;
    } else if (/\btomorrow\b/.test(lower)) {
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      intent.targetDate = tomorrow;
    } else if (/\btoday\b|\btonight\b/.test(lower)) {
      intent.targetDate = new Date(now);
    }
    
    return intent;
  }
  
  // Helper: Get last occurrence of a weekday (0=Sunday, 1=Monday, etc.)
  getLastWeekday(date, weekday) {
    const result = new Date(date);
    const currentDay = result.getUTCDay();
    const daysAgo = (currentDay - weekday + 7) % 7 || 7; // If same day, go back 7 days
    result.setUTCDate(result.getUTCDate() - daysAgo);
    return result;
  }
  
  // Helper: Get this week's occurrence of a weekday
  getThisWeekday(date, weekday) {
    const result = new Date(date);
    const currentDay = result.getUTCDay();
    const daysDiff = weekday - currentDay;
    result.setUTCDate(result.getUTCDate() + daysDiff);
    return result;
  }
  
  // Helper: Get start of week (Sunday) with week offset
  getStartOfWeek(date, weekOffset = 0) {
    const result = new Date(date);
    const currentDay = result.getUTCDay();
    result.setUTCDate(result.getUTCDate() - currentDay + (weekOffset * 7));
    return result;
  }

  /**
   * Check if a query is a sports results request
   */
  isSportsQuery(query) {
    const q = query || '';
    const lower = q.toLowerCase();

    // Guardrail: avoid hijacking creative / asset-generation prompts that mention sports words.
    // Example false positive: "Generate a hero image ... football field grid ... PNG".
    const looksCreative = /\b(generate|create|design|make)\b/i.test(q) && /\b(image|png|jpg|jpeg|svg|gif|video|logo|banner|hero|mockup|ui|website|landing)\b/i.test(q);
    const looksLikeScoreQuestion = /\b(score|scores|result|results|final|game|games|standings)\b/i.test(q);
    if (looksCreative && !looksLikeScoreQuestion) {
      return false;
    }

    // Primary keyword patterns
    if (Object.keys(this.sportsPatterns).some(sport => this.sportsPatterns[sport].test(q))) {
      return true;
    }

    // Secondary: NFL matchup/score queries that omit "NFL" but mention teams.
    // Examples:
    // - "what were the scores of the eagles vs bills game"
    // - "eagles bills score"
    // Secondary: NFL matchup/score queries that omit "NFL" but mention teams.
    const mentionsScorey = /\b(score|scores|result|results|final|game)\b/i.test(q);
    const mentionsVs = /\bvs\b|\bv\.?\b|\bagainst\b/i.test(q);
    if (mentionsScorey && (mentionsVs || /\b(played|play)\b/i.test(q))) {
      const hits = this.nflTeams ? this.nflTeams.filter(t => lower.includes(t)).length : 0;
      if (hits >= 1) return true;
    }

    return false;
  }

  /**
   * Get the sport type from the query
   */
  getSportType(query) {
    const q = query || '';
    const lower = q.toLowerCase();

    for (const [sport, pattern] of Object.entries(this.sportsPatterns)) {
      if (pattern.test(query)) {
        return sport;
      }
    }

    // Heuristic mapping for NFL matchup queries
    const looksLikeScoreQuestion = /\b(score|scores|result|results|final|game)\b/i.test(q);
    const mentionsVs = /\bvs\b|\bv\.?\b|\bagainst\b/i.test(q);
    if (looksLikeScoreQuestion && (mentionsVs || /\b(played|play)\b/i.test(q))) {
      const hits = this.nflTeams ? this.nflTeams.filter(t => lower.includes(t)).length : 0;
      if (hits >= 1) return 'nfl';
    }

    return null;
  }

  /**
   * Format sports results for clean display with dates
   */
  formatSportsResults(games, sport) {
    if (!games || games.length === 0) {
      return `No recent ${sport.toUpperCase()} games found.`;
    }

    // Group games by date
    const gamesByDate = {};
    games.forEach(game => {
      const dateKey = game.game_date_formatted || 'Unknown Date';
      if (!gamesByDate[dateKey]) {
        gamesByDate[dateKey] = [];
      }
      gamesByDate[dateKey].push(game);
    });

    let response = `## Recent ${sport.toUpperCase()} Results\n\n`;

    // If multiple dates, group by date. If single date, show inline
    const dateKeys = Object.keys(gamesByDate);
    const multipleDates = dateKeys.length > 1;

    dateKeys.forEach(dateKey => {
      if (multipleDates) {
        response += `### ${dateKey}\n`;
      }

      gamesByDate[dateKey].forEach(game => {
        const homeTeam = game.home_team ?? game.homeTeam ?? 'Unknown';
        const awayTeam = game.away_team ?? game.awayTeam ?? 'Unknown';
        const homeScore = game.home_score ?? game.homeScore ?? '?';
        const awayScore = game.away_score ?? game.awayScore ?? '?';
        const status = game.status || game.gameStatus || 'Final';
        
        // Include date inline if single date, otherwise already in header
        if (multipleDates) {
          response += `- **${awayTeam}** ${awayScore} @ **${homeTeam}** ${homeScore} (${status})\n`;
        } else {
          response += `- **${awayTeam}** ${awayScore} @ **${homeTeam}** ${homeScore} (${status}, ${game.game_date_short})\n`;
        }
      });

      if (multipleDates) {
        response += '\n';
      }
    });

    return response;
  }

  /**
   * Get ESPN API endpoint for sport
   */
  getESPNEndpoint(sport, targetDate = null) {
    const endpoints = {
      nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
      nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
      nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard'
    };
    
    const baseUrl = endpoints[sport];
    if (!baseUrl) return null;
    
    // Add date parameter if targetDate is specified
    if (targetDate) {
      const dateStr = format(targetDate, 'yyyyMMdd'); // ESPN expects YYYYMMDD format
      return `${baseUrl}?dates=${dateStr}`;
    }
    
    return baseUrl;
  }

  /**
   * Fetch real scores from ESPN API
   */
  async fetchESPNScores(sport, targetDate = null) {
    const endpoint = this.getESPNEndpoint(sport, targetDate);
    if (!endpoint) {
      console.error(`[SportsResultsHandler] No ESPN endpoint for sport: ${sport}`);
      return [];
    }

    try {
      console.log(`[SportsResultsHandler] Fetching from: ${endpoint}`);
      const response = await fetch(endpoint);
      if (!response.ok) {
        console.error(`[SportsResultsHandler] ESPN API error: ${response.status}`);
        return [];
      }

      const data = await response.json();
      
      // Extract games from ESPN API response
      if (!data.events || !Array.isArray(data.events)) {
        console.log('[SportsResultsHandler] No events in ESPN response');
        return [];
      }

      const games = [];
      for (const event of data.events) {
        if (!event.competitions || !event.competitions[0]) continue;
        
        const competition = event.competitions[0];
        const competitors = competition.competitors;
        
        if (!competitors || competitors.length < 2) continue;
        
        // ESPN API structure: competitors[0] = home, competitors[1] = away
        const homeTeam = competitors.find(c => c.homeAway === 'home');
        const awayTeam = competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) continue;
        
        // Parse game date
        const gameDate = event.date ? new Date(event.date) : new Date();
        const dayOfWeek = formatInTz(gameDate, DEFAULT_TZ, { weekday: 'short' });
        const monthDay = formatInTz(gameDate, DEFAULT_TZ, { month: 'numeric', day: 'numeric' });
        const fullDate = formatInTz(gameDate, DEFAULT_TZ, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        games.push({
          home_team: homeTeam.team.displayName,
          away_team: awayTeam.team.displayName,
          home_score: homeTeam.score || '0',
          away_score: awayTeam.score || '0',
          status: competition.status?.type?.detail || 'Unknown',
          game_date: gameDate,
          game_date_short: `${dayOfWeek}. ${monthDay}`,
          game_date_formatted: fullDate
        });
      }

      console.log(`[SportsResultsHandler] Found ${games.length} games for ${format(targetDate || new Date(), 'yyyy-MM-dd')}`);
      return games;
    } catch (error) {
      console.error(`[SportsResultsHandler] Error fetching ESPN scores:`, error.message);
      return [];
    }
  }

  /**
   * Handle sports results request
   */
  async handleSportsQuery(query, num_results = 10) {
    try {
      const sport = this.getSportType(query);
      if (!sport) return null;

      const intent = this.parseSportsIntent(query);
      const now = new Date();
      
      console.log(`[SportsResultsHandler] Intent:`, {
        wantPast: intent.wantPast,
        wantUpcoming: intent.wantUpcoming,
        dayOfWeek: intent.dayOfWeek,
        targetDate: intent.targetDate ? format(intent.targetDate, 'yyyy-MM-dd') : null,
        dateRange: intent.dateRange ? {
          start: format(intent.dateRange.start, 'yyyy-MM-dd'),
          end: format(intent.dateRange.end, 'yyyy-MM-dd')
        } : null
      });
      
      // Fetch scores with target date if computed
      let games = [];
      if (intent.targetDate) {
        games = await this.fetchESPNScores(sport, intent.targetDate);
        if (games.length === 0) {
          const dateStr = format(intent.targetDate, 'EEEE, MMMM d, yyyy');
          return `No ${sport.toUpperCase()} games were found on ${dateStr}.`;
        }
      } else if (intent.dateRange) {
        // For date ranges, we'll fetch the start date first (could be extended later)
        games = await this.fetchESPNScores(sport, intent.dateRange.start);
        if (games.length === 0) {
          const rangeStr = `${format(intent.dateRange.start, 'MMM d')} - ${format(intent.dateRange.end, 'MMM d, yyyy')}`;
          return `No ${sport.toUpperCase()} games were found for the week of ${rangeStr}.`;
        }
      } else {
        // Default behavior: fetch current scoreboard
        games = await this.fetchESPNScores(sport);
        if (!games || games.length === 0) {
          return `No recent ${sport.toUpperCase()} games found. Games may not be scheduled today or the API may be temporarily unavailable.`;
        }
      }

      let filteredGames = games.slice();

      // Apply past/future filtering for date-specific queries
      if (intent.wantPast && intent.targetDate) {
        filteredGames = filteredGames.filter(g => {
          const status = (g.status || '').toLowerCase();
          const isFinal = status.includes('final');
          return isFinal && g.game_date && g.game_date <= now;
        });
        
        // If no past games on the specific date, provide helpful message
        if (filteredGames.length === 0) {
          const dateStr = format(intent.targetDate, 'EEEE, MMMM d, yyyy');
          return `No completed ${sport.toUpperCase()} games were found on ${dateStr}. The games may not have finished yet or there were no games scheduled.`;
        }
      }

      // Apply day-of-week filtering if still needed (for generic queries without specific date)
      if (intent.dayOfWeek !== null && !intent.targetDate) {
        filteredGames = filteredGames.filter(g => g.game_date && g.game_date.getDay() === intent.dayOfWeek);
      }

      // If past-oriented query yielded no games after filtering, return null to let agent handle
      if (intent.wantPast && filteredGames.length === 0 && !intent.targetDate) {
        return null;
      }

      const baseGames = filteredGames.length > 0 ? filteredGames : games;
      const limitedGames = baseGames.slice(0, num_results);
      
      return this.formatSportsResults(limitedGames, sport);
    } catch (error) {
      console.error(`[SportsResultsHandler] Error handling sports query:`, error);
      return null;
    }
  }
}

// Singleton instance
const sportsHandler = new SportsResultsHandler();

// Middleware to intercept and handle sports queries
async function sportsQueryMiddleware(ctx, next) {
  const { question } = ctx.request.body;
  
  if (sportsHandler.isSportsQuery(question)) {
    try {
      const response = await sportsHandler.handleSportsQuery(question);
      if (response) {
        ctx.body = { 
          response,
          type: 'chat',
          metadata: { isSportsResult: true }
        };
        return;
      }
    } catch (error) {
      console.error('[SportsMiddleware] Error processing sports query:', error);
      // Continue to normal processing if there's an error
    }
  }
  
  // Not a sports query or error occurred, continue to next middleware
  await next();
}

module.exports = {
  SportsResultsHandler,
  sportsQueryMiddleware,
  sportsHandler
};
