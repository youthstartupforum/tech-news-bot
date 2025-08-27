console.log('Bot starting...');
console.log('Node version:', process.version);
console.log('Current time:', new Date());

const https = require('https');
const http = require('http');

// Configuration - Multiple webhook URLs
const DISCORD_WEBHOOKS = {
  tech_news: 'https://discord.com/api/webhooks/1409762044315566170/VbgnZQJVH9gX-Eh7JUbLhK_QaZ88qIHawv6zxK0nfmK1yW9NqMT30FEFKHyu08nhI4dY',
  advice: 'https://discord.com/api/webhooks/1410063713465139220/ZzkTCxvwuLL0jyHyKhpBDGjGML1y0VumskVjVLFBQmQmtgjYu5nAWsV2TegX1dAtxH8D',
  updates: 'https://discord.com/api/webhooks/1410063450184613888/L0VMhqgpWj4Gs80Ye_c5jkVYiSBHguO4hpBO4KmroQcPGSqz6hBGiSa1FDUuR7jjHJW4'
};

// News sources configuration
const NEWS_SOURCES = {
  techcrunch: {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    type: 'rss',
    webhook: 'tech_news',
    color: 0x00ff00
  },
  engadget: {
    name: 'Engadget',
    url: 'https://www.engadget.com/rss.xml',
    type: 'rss',
    webhook: 'tech_news',
    color: 0xff6b35
  },
  arstechnica: {
    name: 'Ars Technica',
    url: 'http://feeds.arstechnica.com/arstechnica/index',
    type: 'rss',
    webhook: 'tech_news',
    color: 0xff4500
  },
  lennys_podcast: {
    name: "Lenny's Podcast",
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6t1O76G0jYXOAoYCm153dA',
    type: 'youtube',
    webhook: 'advice',
    color: 0xff0000
  },
  nfm_live: {
    name: 'NFM Live',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-CLjGxlWeBqVMoVcg4Vp9A',
    type: 'youtube',
    webhook: 'updates',
    color: 0x0066cc
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

// Parse RSS/XML feeds (works for both news and YouTube)
function parseRSSFeed(xmlData, sourceType, sourceKey) {
  const articles = [];
  
  // Set limits per source
  const limits = {
    'nfm_live': 2,
    'lennys_podcast': 1,
    'default': 3
  };
  const maxCount = limits[sourceKey] || limits['default'];
  
  if (sourceType === 'youtube') {
    // YouTube RSS uses <entry> instead of <item>
    const entryRegex = /<entry>(.*?)<\/entry>/gs;
    const titleRegex = /<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/s;
    const linkRegex = /<link[^>]*href=["'](.*?)["']/s;
    const publishedRegex = /<published>(.*?)<\/published>/s;
    const descRegex = /<media:description>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/media:description>/s;
    
    // Date filtering: only videos from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    let matches = xmlData.matchAll(entryRegex);
    let count = 0;
    
    for (let match of matches) {
      if (count >= maxCount) break;
      
      const entryContent = match[1];
      
      const titleMatch = entryContent.match(titleRegex);
      const linkMatch = entryContent.match(linkRegex);
      const publishedMatch = entryContent.match(publishedRegex);
      const descMatch = entryContent.match(descRegex);
      
      if (titleMatch && linkMatch && publishedMatch) {
        const title = (titleMatch[1] || titleMatch[2] || '').trim();
        const link = linkMatch[1].trim();
        const description = (descMatch ? (descMatch[1] || descMatch[2] || '') : '').replace(/<[^>]*>/g, '').trim();
        const published = publishedMatch[1].trim();
        const publishedDate = new Date(published);
        
        // Only include videos from the last 7 days
        if (title && link && publishedDate >= sevenDaysAgo) {
          articles.push({
            title: title.substring(0, 200),
            link,
            description: description.substring(0, 300) + '...',
            pubDate: published
          });
          count++;
        }
      }
    }
  } else {
    // Regular RSS parsing for news sites
    const itemRegex = /<item[^>]*>(.*?)<\/item>/gs;
    const titleRegex = /<title[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/s;
    const linkRegex = /<link[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/link>/s;
    const descRegex = /<description[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/description>/s;
    const dateRegex = /<pubDate[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/pubDate>/s;
    
    let matches = xmlData.matchAll(itemRegex);
    let count = 0;
    
    for (let match of matches) {
      if (count >= maxCount) break;
      
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
  }
  
  return articles;
}

// Function to parse RSS feeds
async function parseRSSSource(url, sourceType, sourceKey) {
  try {
    const xmlData = await makeRequest(url);
    return parseRSSFeed(xmlData, sourceType, sourceKey);
  } catch (error) {
    console.error(`Error parsing RSS feed ${url}:`, error.message);
    return [];
  }
}

// Function to create a summary
function createSummary(description) {
  if (!description) return 'No description available.';
  const sentences = description.split('. ');
  if (sentences.length >= 2) {
    return sentences.slice(0, 2).join('. ') + '.';
  }
  return description.substring(0, 150) + '...';
}

// Function to send message to Discord (now supports multiple webhooks)
function sendToDiscord(embed, webhookKey) {
  return new Promise((resolve, reject) => {
    const webhookUrl = DISCORD_WEBHOOKS[webhookKey];
    if (!webhookUrl) {
      reject(new Error(`Invalid webhook key: ${webhookKey}`));
      return;
    }
    
    // Parse webhook URL to get path
    const url = new URL(webhookUrl);
    
    // Clean and validate embed data
    const cleanEmbed = {
      title: String(embed.title || "No title").substring(0, 256),
      url: String(embed.url || ""),
      description: String(embed.description || "No description").substring(0, 2048),
      color: Number(embed.color) || 0,
      footer: {
        text: String((embed.footer && embed.footer.text) || "Updates").substring(0, 2048)
      },
      timestamp: embed.timestamp || new Date().toISOString()
    };
    
    const payload = {
      embeds: [cleanEmbed]
    };
    
    // Debug logging
    console.log(`Sending to ${webhookKey}:`, cleanEmbed.title);
    
    const data = JSON.stringify(payload);
    
    const options = {
      hostname: 'discord.com',
      port: 443,
      path: url.pathname,
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
          console.log(`Message sent to ${webhookKey} successfully`);
          resolve();
        } else {
          console.log(`Discord error for ${webhookKey} - Status:`, res.statusCode, 'Response:', responseData);
          reject(new Error(`Discord returned ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`Request error for ${webhookKey}:`, error);
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
}

// Function to format article for Discord embed
function createDiscordEmbed(source, article) {
  const sourceConfig = NEWS_SOURCES[source];
  return {
    title: (article.title || "").trim(),
    url: (article.link || "").trim(),
    description: createSummary(article.description || ""),
    color: sourceConfig.color,
    footer: {
      text: `${sourceConfig.name} • ${new Date(article.pubDate).toLocaleDateString()}`
    },
    timestamp: new Date(article.pubDate).toISOString()
  };
}

// Function to fetch tech news only
async function fetchTechNews() {
  console.log('Starting tech news fetch...');
  
  const techSources = ['techcrunch', 'engadget', 'arstechnica'];
  
  for (const sourceKey of techSources) {
    const sourceConfig = NEWS_SOURCES[sourceKey];
    console.log(`Fetching from ${sourceConfig.name}...`);
    
    try {
      const articles = await parseRSSSource(sourceConfig.url, sourceConfig.type, sourceKey);
      
      for (const article of articles) {
        const embed = createDiscordEmbed(sourceKey, article);
        await sendToDiscord(embed, sourceConfig.webhook);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Error processing ${sourceConfig.name}:`, error.message);
    }
  }
  
  console.log('Tech news fetch completed');
}

// Function to fetch YouTube channels with individual scheduling
async function fetchLennysPodcast() {
  console.log('Starting Lenny\'s Podcast fetch...');
  
  const sourceKey = 'lennys_podcast';
  const sourceConfig = NEWS_SOURCES[sourceKey];
  
  try {
    const articles = await parseRSSSource(sourceConfig.url, sourceConfig.type, sourceKey);
    
    if (articles.length === 0) {
      console.log(`No recent videos found for ${sourceConfig.name} (within last 7 days)`);
    }
    
    for (const article of articles) {
      const embed = createDiscordEmbed(sourceKey, article);
      await sendToDiscord(embed, sourceConfig.webhook);
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`Error processing ${sourceConfig.name}:`, error.message);
  }
  
  console.log('Lenny\'s Podcast fetch completed');
}

async function fetchNFMLive() {
  console.log('Starting NFM Live fetch...');
  
  const sourceKey = 'nfm_live';
  const sourceConfig = NEWS_SOURCES[sourceKey];
  
  try {
    const articles = await parseRSSSource(sourceConfig.url, sourceConfig.type, sourceKey);
    
    if (articles.length === 0) {
      console.log(`No recent videos found for ${sourceConfig.name} (within last 7 days)`);
    }
    
    for (const article of articles) {
      const embed = createDiscordEmbed(sourceKey, article);
      await sendToDiscord(embed, sourceConfig.webhook);
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`Error processing ${sourceConfig.name}:`, error.message);
  }
  
  console.log('NFM Live fetch completed');
}

// Combined YouTube function for initial run
async function fetchYouTubeUpdates() {
  await fetchLennysPodcast();
  await fetchNFMLive();
}

// Combined function for compatibility
async function fetchAndPostNews() {
  await fetchTechNews();
}

// Function to schedule regular updates with separate timings
function scheduleUpdates() {
  // Run immediately (both tech news and YouTube)
  fetchTechNews();
  fetchYouTubeUpdates();
  
  // Schedule tech news: 8am and 8pm Korea time
  function scheduleTechNews() {
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    
    // Target times in Korea (hours: 8, 20)
    const targetHours = [8, 20];
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
    
    // If no time found today, use tomorrow's first time (8am)
    if (!found) {
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(8, 0, 0, 0);
    }
    
    // Convert back to local time for setTimeout
    const delay = nextRun.getTime() - now.getTime();
    
    console.log(`Next tech news run scheduled for: ${nextRun.toLocaleString("en-US", {timeZone: "Asia/Seoul"})} Korea time`);
    
    setTimeout(() => {
      fetchTechNews();
      scheduleTechNews(); // Schedule the next tech news run
    }, delay);
  }
  
  // Schedule YouTube updates with different frequencies
  function scheduleLennysPodcast() {
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    
    // Target time: 8am Korea, every 3 days
    let nextRun = new Date(koreaTime);
    nextRun.setHours(8, 0, 0, 0);
    
    // If 8am already passed today, schedule for 3 days from now
    if (nextRun <= koreaTime) {
      nextRun.setDate(nextRun.getDate() + 3);
      nextRun.setHours(8, 0, 0, 0);
    }
    
    // Convert back to local time for setTimeout
    const delay = nextRun.getTime() - now.getTime();
    
    console.log(`Next Lenny's Podcast run scheduled for: ${nextRun.toLocaleString("en-US", {timeZone: "Asia/Seoul"})} Korea time`);
    
    setTimeout(() => {
      fetchLennysPodcast();
      scheduleLennysPodcast(); // Schedule the next run (3 days later)
    }, delay);
  }
  
  function scheduleNFMLive() {
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    
    // Target time: 8am Korea, weekdays only (Monday = 1, Friday = 5)
    let nextRun = new Date(koreaTime);
    nextRun.setHours(8, 0, 0, 0);
    
    // If 8am already passed today or it's weekend, find next weekday
    while (nextRun <= koreaTime || nextRun.getDay() === 0 || nextRun.getDay() === 6) {
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(8, 0, 0, 0);
    }
    
    // Convert back to local time for setTimeout
    const delay = nextRun.getTime() - now.getTime();
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const koreaTimeAtRun = new Date(nextRun.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    console.log(`Next NFM Live run scheduled for: ${nextRun.toLocaleString("en-US", {timeZone: "Asia/Seoul"})} Korea time (${dayNames[koreaTimeAtRun.getDay()]})`);
    
    setTimeout(() => {
      fetchNFMLive();
      scheduleNFMLive(); // Schedule the next weekday run
    }, delay);
  }
  
  // Start all schedulers
  scheduleTechNews();
  scheduleLennysPodcast();
  scheduleNFMLive();
  
  console.log('Tech news scheduled for 8am and 8pm Korea time');
  console.log('Lenny\'s Podcast scheduled every 3 days at 8am Korea time');
  console.log('NFM Live scheduled weekdays at 8am Korea time');
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