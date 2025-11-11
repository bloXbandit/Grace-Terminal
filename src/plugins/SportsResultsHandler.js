const { format } = require('date-fns');

/**
 * Specialized handler for sports results that ensures clean, direct display in chat
 */
class SportsResultsHandler {
  constructor() {
    this.sportsPatterns = {
      nfl: /\b(nfl|football|nfl scores?|nfl results?|nfl games?)\b/i,
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

  /**
   * Check if a query is a sports results request
   */
  isSportsQuery(query) {
    return Object.keys(this.sportsPatterns).some(sport => 
      this.sportsPatterns[sport].test(query)
    );
  }

  /**
   * Get the sport type from the query
   */
  getSportType(query) {
    for (const [sport, pattern] of Object.entries(this.sportsPatterns)) {
      if (pattern.test(query)) {
        return sport;
      }
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
  getESPNEndpoint(sport) {
    const endpoints = {
      nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
      nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
      nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard'
    };
    return endpoints[sport];
  }

  /**
   * Fetch real scores from ESPN API
   */
  async fetchESPNScores(sport) {
    const endpoint = this.getESPNEndpoint(sport);
    if (!endpoint) {
      console.error(`[SportsResultsHandler] No ESPN endpoint for sport: ${sport}`);
      return [];
    }

    try {
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
        const dayOfWeek = format(gameDate, 'EEE');
        const monthDay = format(gameDate, 'M/d');
        const fullDate = format(gameDate, 'EEEE, MMMM d, yyyy');
        
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

      console.log(`[SportsResultsHandler] Fetching ${sport.toUpperCase()} scores from ESPN API...`);
      
      // Fetch real scores from ESPN API
      const games = await this.fetchESPNScores(sport);
      
      if (!games || games.length === 0) {
        return `No recent ${sport.toUpperCase()} games found. Games may not be scheduled today or the API may be temporarily unavailable.`;
      }

      // Limit to requested number of results
      const limitedGames = games.slice(0, num_results);
      
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
