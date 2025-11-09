const { expect } = require('chai');
const { SportsResultsHandler } = require('../src/plugins/SportsResultsHandler');

// Mock WebSearchTool for testing
const mockWebSearch = {
  execute: async ({ query }) => {
    console.log(`[MOCK] Searching for: ${query}`);
    // Return mock ESPN-style results
    return {
      content: JSON.stringify([
        {
          home_team: 'Kansas City Chiefs',
          away_team: 'Philadelphia Eagles',
          home_score: 38,
          away_score: 35,
          status: 'Final',
          date: '2023-02-12'
        },
        {
          home_team: 'San Francisco 49ers',
          away_team: 'Dallas Cowboys',
          home_score: 19,
          away_score: 12,
          status: 'Final',
          date: '2023-01-22'
        }
      ])
    };
  }
};

describe('SportsResultsHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new SportsResultsHandler();
    // Mock the WebSearchTool
    handler.WebSearchTool = mockWebSearch;
  });

  describe('isSportsQuery', () => {
    it('should detect NFL queries', () => {
      expect(handler.isSportsQuery('What were the NFL scores yesterday?')).to.be.true;
      expect(handler.isSportsQuery('Show me the latest football results')).to.be.true;
      expect(handler.isSportsQuery('nfl games this week')).to.be.true;
    });

    it('should detect other sports', () => {
      expect(handler.isSportsQuery('NBA scores today')).to.be.true;
      expect(handler.isSportsQuery('MLB results from yesterday')).to.be.true;
      expect(handler.isSportsQuery('NHL games tonight')).to.be.true;
    });

    it('should return false for non-sports queries', () => {
      expect(handler.isSportsQuery('What is the weather today?')).to.be.false;
      expect(handler.isSportsQuery('How to cook pasta')).to.be.false;
    });
  });

  describe('formatSportsResults', () => {
    it('should format NFL results correctly', () => {
      const mockResults = [
        {
          home_team: 'Kansas City Chiefs',
          away_team: 'Philadelphia Eagles',
          home_score: 38,
          away_score: 35,
          status: 'Final'
        }
      ];

      const formatted = handler.formatSportsResults(mockResults, 'nfl');
      expect(formatted).to.include('NFL Football');
      expect(formatted).to.include('Kansas City Chiefs');
      expect(formatted).to.include('Philadelphia Eagles');
      expect(formatted).to.include('38 - 35');
    });

    it('should handle empty results', () => {
      const formatted = handler.formatSportsResults([], 'nfl');
      expect(formatted).to.equal('No recent game results found.');
    });
  });

  describe('handleSportsQuery', () => {
    it('should process NFL queries', async () => {
      const response = await handler.handleSportsQuery('NFL scores');
      expect(response).to.be.a('string');
      expect(response).to.include('NFL Football');
      expect(response).to.include('Kansas City Chiefs');
      expect(response).to.include('Philadelphia Eagles');
    });
  });
});
