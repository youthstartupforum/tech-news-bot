const axios = require('axios');
const cheerio = require('cheerio');

// Configuration
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1409762044315566170/VbgnZQJVH9gX-Eh7JUbLhK_QaZ88qIHawv6zxK0nfmK1yW9NqMT30FEFKHyu08nhI4dY';

// News sources configuration  
const NEWS_SOURCES = {
  techcrunch: {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    type: 'rss'
  },
  engadget: {
    name: 'Engadget',
    url: 'https://www.engadget.com/rss.xml',
    type: 'rss'
  },
  arstechnica: {
    name: 'Ars Technica',
    url: 'http://feeds.arstechnica.com/arstechnica/index',
    type: 'rss'
  }
};

// Function to parse RSS feeds
async function parseRSSFeed(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data, { xmlMode: true });
    
    const articles = [];
    $('item').each((index, element) => {
      if (index < 1) { // Get only the top 1 article
        const title = $(element).find('title').text();
        const link = $(element).find('link').text();
        const description = $(element).find('description').text().replace(/<[^>]*>/g, ''); // Strip HTML
        const pubDate = $(element).find('pubDate').text();
        
        articles.push({
          title,
          link,
          description: description.substring(0, 300) + '...', // Truncate description
          pubDate,
          source: url // Add source for comparison
        });
      }
    });
    
    return articles;
  } catch (error) {
    console.error(`Error parsing RSS feed ${url}:`, error);
    return [];
  }
}

// Function to create a summary using a simple approach
function createSummary(description) {
  // Simple summary: take first 2 sentences or 150 characters
  const sentences = description.split('. ');
  if (sentences.length >= 2) {
    return sentences.slice(0, 2).join('. ') + '.';
  }
  return description.substring(0, 150) + '...';
}

// Function to send message to Discord
async function sendToDiscord(embed) {
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [embed]
    });
    console.log('Message sent to Discord successfully');
  } catch (error) {
    console.error('Error sending to Discord:', error);
  }
}

// Function to format article for Discord embed
function createDiscordEmbed(source, article) {
  return {
    title: article.title,
    url: article.link,
    description: createSummary(article.description),
    color: getSourceColor(source),
    footer: {
      text: `${NEWS_SOURCES[source].name} • ${new Date(article.pubDate).toLocaleDateString()}`
    },
    timestamp: new Date(article.pubDate).toISOString()
  };
}

// Function to get color based on source
function getSourceColor(source) {
  const colors = {
    techcrunch: 0x00ff00,  // Green
    engadget: 0xff6b35,    // Orange  
    arstechnica: 0xff4500  // Red-Orange
  };
  return colors[source] || 0x000000;
}

// Main function to fetch and post news
async function fetchAndPostNews() {
  console.log('Starting news fetch...');
  
  let allArticles = [];
  
  // Collect articles from all sources
  for (const [sourceKey, sourceConfig] of Object.entries(NEWS_SOURCES)) {
    console.log(`Fetching from ${sourceConfig.name}...`);
    
    const articles = await parseRSSFeed(sourceConfig.url);
    
    // Add source info to each article
    articles.forEach(article => {
      article.sourceKey = sourceKey;
    });
    
    allArticles.push(...articles);
  }
  
  // Sort by publication date (most recent first)
  allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  
  // Post only the most recent article
  if (allArticles.length > 0) {
    const newestArticle = allArticles[0];
    const embed = createDiscordEmbed(newestArticle.sourceKey, newestArticle);
    await sendToDiscord(embed);
    console.log(`Posted newest article: ${newestArticle.title}`);
  }
  
  console.log('News fetch completed');
}

// Function to schedule regular updates
function scheduleUpdates() {
  // Run immediately
  fetchAndPostNews();
  
  // Run every 4 hours (adjust as needed)
  setInterval(fetchAndPostNews, 4 * 60 * 60 * 1000);
  
  console.log('News bot scheduled to run every 4 hours');
}

// Export for use
module.exports = {
  fetchAndPostNews,
  scheduleUpdates
};

// If running directly
if (require.main === module) {
  scheduleUpdates();
}