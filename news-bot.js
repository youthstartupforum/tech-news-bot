console.log('Bot starting...');
console.log('Node version:', process.version);
console.log('Current time:', new Date());

const https = require('https');
const http = require('http');

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

// Simple HTTP request function
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'TechNewsBot/1.0'
      }
    };
    
    protocol.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Simple XML parsing function
function parseRSSFeed(xmlData) {
  const articles = [];
  
  // Simple regex-based XML parsing with better CDATA handling
  const itemRegex = /<item[^>]*>(.*?)<\/item>/gs;
  const titleRegex = /<title[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/s;
  const linkRegex = /<link[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/link>/s;
  const descRegex = /<description[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/description>/s;
  const dateRegex = /<pubDate[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/pubDate>/s;
  
  let matches = xmlData.matchAll(itemRegex);
  let count = 0;
  
  for (let match of matches) {
    if (count >= 3) break;
    
    const itemContent = match[1];
    
    const titleMatch = itemContent.match(titleRegex);
    const linkMatch = itemContent.match(linkRegex);
    const descMatch = itemContent.match(descRegex);
    const dateMatch = itemContent.match(dateRegex);
    
    if (titleMatch && linkMatch) {
      const title = (titleMatch[1] || titleMatch[2] || '').trim();
      const link = (linkMatch[1] || linkMatch[2] || '').trim();
      const description = (descMatch ? (descMatch[1] || descMatch[2] || '') : '').replace(/<[^>]*>/g, '').trim();
      const pubDate = dateMatch ? (dateMatch[1] || dateMatch[2] || '').trim() : new Date().toISOString();
      
      if (title && link && !link.includes('<![CDATA[')) {
        articles.push({
          title: title.substring(0, 200),
          link,
          description: description.substring(0, 300) + '...',
          pubDate
        });
        count++;
      }
    }
  }
  
  return articles;
}

// Function to parse RSS feeds
async function parseRSSSource(url) {
  try {
    const xmlData = await makeRequest(url);
    return parseRSSFeed(xmlData);
  } catch (error) {
    console.error(`Error parsing RSS feed ${url}:`, error.message);
    return [];
  }
}

// Function to create a summary
function createSummary(description) {
  const sentences = description.split('. ');
  if (sentences.length >= 2) {
    return sentences.slice(0, 2).join('. ') + '.';
  }
  return description.substring(0, 150) + '...';
}

  // Function to send message to Discord
function sendToDiscord(embed) {
  return new Promise((resolve, reject) => {
    // Clean and validate embed data
    const cleanEmbed = {
      title: String(embed.title || "No title").substring(0, 256),
      url: String(embed.url || ""),
      description: String(embed.description || "No description").substring(0, 2048),
      color: Number(embed.color) || 0,
      footer: {
        text: String((embed.footer && embed.footer.text) || "Tech News").substring(0, 2048)
      },
      timestamp: embed.timestamp || new Date().toISOString()
    };
    
    const payload = {
      embeds: [cleanEmbed]
    };
    
    // Debug logging
    console.log('Sending embed:', JSON.stringify(payload, null, 2));
    
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'discord.com',
      port: 443,
      path: '/api/webhooks/1409762044315566170/VbgnZQJVH9gX-Eh7JUbLhK_QaZ88qIHawv6zxK0nfmK1yW9NqMT30FEFKHyu08nhI4dY',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data, 'utf8')
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode === 204) {
          console.log('Message sent to Discord successfully');
          resolve();
        } else {
          console.log('Discord error - Status:', res.statusCode, 'Response:', responseData);
          reject(new Error(`Discord returned ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
}

// Function to format article for Discord embed
function createDiscordEmbed(source, article) {
  return {
    title: (article.title || "").trim(),
    url: (article.link || "").trim(),
    description: createSummary(article.description || ""),
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
  
  for (const [sourceKey, sourceConfig] of Object.entries(NEWS_SOURCES)) {
    console.log(`Fetching from ${sourceConfig.name}...`);
    
    try {
      const articles = await parseRSSSource(sourceConfig.url);
      
      for (const article of articles) {
        const embed = createDiscordEmbed(sourceKey, article);
        await sendToDiscord(embed);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Error processing ${sourceConfig.name}:`, error.message);
    }
  }
  
  console.log('News fetch completed');
}

// Function to schedule regular updates
function scheduleUpdates() {
  // Run immediately
  fetchAndPostNews();
  
  // Calculate next run times for Korea timezone (12am, 8am, 4pm)
  function scheduleNextRun() {
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    
    // Target times in Korea (hours: 0, 8, 16)
    const targetHours = [0, 8, 16];
    let nextRun = new Date(koreaTime);
    
    // Find next target time
    let found = false;
    for (let hour of targetHours) {
      nextRun.setHours(hour, 0, 0, 0);
      if (nextRun > koreaTime) {
        found = true;
        break;
      }
    }
    
    // If no time found today, use tomorrow's first time (12am)
    if (!found) {
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(0, 0, 0, 0);
    }
    
    // Convert back to local time for setTimeout
    const delay = nextRun.getTime() - now.getTime();
    
    console.log(`Next run scheduled for: ${nextRun.toLocaleString("en-US", {timeZone: "Asia/Seoul"})} Korea time`);
    
    setTimeout(() => {
      fetchAndPostNews();
      scheduleNextRun(); // Schedule the next run
    }, delay);
  }
  
  scheduleNextRun();
  console.log('News bot scheduled for 12am, 8am, and 4pm Korea time');
}

// Export for use
module.exports = {
  fetchAndPostNews,
  scheduleUpdates
};

// If running directly
if (require.main === module) {
  try {
    console.log('Attempting to start scheduler...');
    scheduleUpdates();
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}