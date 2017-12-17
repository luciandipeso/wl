const morgan = require('morgan')
const compression = require('compression')
const express = require('express')
const wl = express()
const sassMiddleware = require('node-sass-middleware')
const cookieParser = require('cookie-parser')
const fs = require('fs')
const async = require('async')
const path = require('path')
const Database = require('better-sqlite3')
const validator = require('validator')
const nconf = require('nconf')
const moment = require('moment')
const rss = require('rss')
const google = require('googleapis')
const OAuth2 = google.auth.OAuth2
const Autolinker = require('autolinker')

nconf.argv()
     .env()

const env = ["prod", "dev"].includes(nconf.get('NODE_ENV')) ? nconf.get('NODE_ENV') : "dev"
nconf.file({ file: path.join(__dirname, "conf", env + ".conf.json") })

const dbFile = path.join(__dirname, nconf.get('dbPath'), nconf.get('dbFile')) || "wl.db"
const db = new Database(dbFile, { readonly: true });

const oauth2 = new OAuth2(
  nconf.get('oauth_client_id') || "",
  nconf.get('oauth_client_secret') || "",
  nconf.get('oauth_redirect_url') || ""
)

const youtube = google.youtube({
  version: 'v3',
  auth: oauth2
})

/**
 * Check if we need to authenticate again
 *
 * @param obj cookies The request cookies
 * @return bool 
 */
function isOAuthenticated(cookies) {
  if(!cookies.hasOwnProperty('oauth_token')) {
    return false
  }

  let token = JSON.parse(cookies.oauth_token)
  let expiry = new Date(token.expiry_date)
  if(expiry > new Date()) {
    return true
  }
  return false
}

/**
 * Get a list of YouTube videos
 *
 * Finds all YouTube videos associated with specified playlists.
 * Once done, calls finalCallback with parameters err and lists
 *
 * @param function finalCallback
 */
function getYouTubeVideos(finalCallback) {
  let lists = []

  let query = 'SELECT playlist_id, youtube_id, title FROM youTubePlaylists ORDER BY title'

  let rows = db.prepare(query).all()
  async.each(rows, function(row, callback) {
    youtube.playlistItems.list({
      part: 'id,snippet',
      playlistId: row.youtube_id,
      maxResults: 30
    }, function(err, data, response) {
      let videos = [], totalVideoCount = 0, nextPageToken = false
      if(!err && data.hasOwnProperty('items')) {
        for(let i=0,length=data.items.length;i<length;i++) {
          videos.push({ 
            title: data.items[i].snippet.title,
            id: data.items[i].snippet.resourceId.videoId,
            thumbnailUrl: data.items[i].snippet.thumbnails.default.url,
            description: Autolinker.link(data.items[i].snippet.description, { newWindow: true })
          })
        }

        if(data.hasOwnProperty('nextPageToken')) {
          nextPageToken = data.nextPageToken
        }

        totalVideoCount = data.pageInfo.totalResults
      }

      lists.push({
        id: row.playlist_id,
        youtube_id: row.youtube_id,
        title: row.title,
        videos: videos,
        totalVideoCount: totalVideoCount,
        nextPageToken: nextPageToken
      })

      callback()
    })
  }, function(err) {
    finalCallback(err, lists)
  })
}

/**
 * Get a list of YouTube videos for a specific playlist
 *
 * Finds all YouTube videos associated with the specified playlist.
 * Once done, calls finalCallback with parameters err and videoData
 *
 * @param int id The playlist ID in the SQL database
 * @param function finalCallback
 * @param string pageToken The page token to send to Google APIs
 */
function getYouTubeVideosById(id, finalCallback, pageToken) {
  let videos = []
  pageToken = pageToken || false

  let query = 'SELECT playlist_id, youtube_id FROM youTubePlaylists WHERE playlist_id = ?'
  let row = db.prepare(query).get(id)

  let youtubeParams = {
    part: 'id,snippet',
    playlistId: row.youtube_id,
    maxResults: 30
  }
  if(pageToken) {
    youtubeParams.pageToken = pageToken
  }
  youtube.playlistItems.list(youtubeParams, function(err, data, response) {
    let totalVideoCount = 0, nextPageToken = false
    if(!err && data.hasOwnProperty('items')) {
      for(let i=0,length=data.items.length;i<length;i++) {
        videos.push({ 
          title: data.items[i].snippet.title,
          id: data.items[i].snippet.resourceId.videoId,
          thumbnailUrl: data.items[i].snippet.thumbnails.default.url,
          description: Autolinker.link(data.items[i].snippet.description, { newWindow: true })
        })
      }

      if(data.hasOwnProperty('nextPageToken')) {
        nextPageToken = data.nextPageToken
      }

      totalVideoCount = data.pageInfo.totalResults
    }

    finalCallback(err, {
      nextPageToken: nextPageToken,
      totalVideoCount: totalVideoCount,
      videos: videos
    })
  })
}

/**
 * Gets a post without child objects
 *
 * @param object row The post data
 * @return object
 */
function getSparsePost(row) {
  return {
    id: row.post_post_id || 0,
    title: row.post_title || '',
    subtitle: row.post_subtitle || '',
    type: row.post_type || 'essay',
    dateAdded: row.post_date_added || moment(),
    dateUpdated: row.post_date_updated || moment(),
    lat: row.post_lat || null,
    lng: row.post_lng || null,
    latlng: (row.post_lat && row.post_lng) ? row.post_lat + ', ' + row.post_lng : null,
    post: row.post_post || '',
    author: row.post_author || '',
    postlets: [],
    citations: []
  }
}

/**
 * Get list of all posts
 *
 * Used for RSS feeds
 *
 * @return array List of all posts
 */
function getPostList() {
  let posts = []
  
  let query = 'SELECT p.post_id post_post_id, p.title post_title, p.subtitle post_subtitle,' +
    ' p.type post_type, p.date_added post_date_added, p.date_updated post_date_updated, p.lat post_lat,' +
    ' p.lng post_lng, p.post post_post, p.author post_author FROM post p ORDER BY post_date_added'

  let rows = db.prepare(query).all()
  for(let i=0; i<rows.length; i++) {
    let row = rows[i]
    posts.push(getSparsePost(row))
  }

  return posts
}

/**
 * Get list of all podcast posts
 *
 * Used for RSS feeds
 *
 * @return array List of all posts
 */
function getLucianReadsToSavannaList() {
  let posts = []
  
  let query = 'SELECT post_id, title, date_added, url, size FROM lucianReadsToSavannaPost ORDER BY date_added'

  let rows = db.prepare(query).all()
  for(let i=0; i<rows.length; i++) {
    let row = rows[i]
    posts.push({
      id: row.post_id,
      title: row.title,
      dateAdded: row.date_added || moment().format('YYYY-MM-DD HH:mm:ss'),
      url: 'http://whereslucian.com/images/lucianreads/' + encodeURI(row.url), 
      filePath: path.join(__dirname, 'public', 'images', 'lucianreads', row.url),
      size: row.size || 0
    })
  }

  return posts
}

/**
 * Fleshes out sparse post
 *
 * Adds child data supplied in row
 *
 * @param object existingPost The post object to modify
 * @param object row The data to mix in
 * @return object The modified post object
 */
function buildPost(existingPost, row) {
  if(row.postlet_postlet_id) {
    existingPost.postlets.push({
      id: row.postlet_postlet_id,
      dateAdded: row.postlet_date_added || moment(),
      lat: row.postlet_lat || null,
      lng: row.postlet_lng || null,
      post: row.postlet_post || ''
    })
  } 

  if(row.citation_cite_id) {
    existingPost.citations.push({
      id: row.citation_cite_id,
      citation: row.citation_citation
    })
  }

  return existingPost
}

/**
 * Get two posts
 *
 * @param int offset The offset to use in the db query
 * @return array An array of two posts
 */
function getPosts(offset) {
  let posts = [],
      postsIndex = {};
  
  let query = 'SELECT p.post_id post_post_id, p.title post_title, p.subtitle post_subtitle,' +
    ' p.type post_type, p.date_added post_date_added, p.date_updated post_date_updated, p.lat post_lat,' +
    ' p.lng post_lng, p.post post_post, p.author post_author,' +
    ' postlet.postlet_id postlet_postlet_id, postlet.date_added postlet_date_added, postlet.lat postlet_lat,' +
    ' postlet.lng postlet_lng, postlet.post postlet_post, citation.cite_id citation_cite_id, citation.citation citation_citation' +
    ' FROM (SELECT * FROM post ORDER BY post.date_added DESC LIMIT 2 OFFSET ' + offset + ') p' +
    ' LEFT JOIN postlet ON p.post_id = postlet.post_id' +
    ' LEFT JOIN citation ON p.post_id = citation.post_id' +
    ' ORDER BY post_date_added DESC, postlet_date_added DESC, citation_citation ASC'

  let rows = db.prepare(query).all()
  for(let i=0; i<rows.length; i++) {
    let row = rows[i]
    let postId = row.post_post_id
    if(!postsIndex.hasOwnProperty(postId)) {
      postKey = posts.length
      postsIndex[postId] = postKey
      posts.push(getSparsePost(row))
    } else {
      postKey = postsIndex[postId]
    }

    posts[postKey] = buildPost(posts[postKey], row)
  }
  return posts
}

/**
 * Get a single post
 *
 * @param int id The post ID
 * @return object The post
 */
function getPost(id) {
  let query = 'SELECT p.post_id post_post_id, p.title post_title, p.subtitle post_subtitle,' +
    ' p.type post_type, p.date_added post_date_added, p.date_updated post_date_updated, p.lat post_lat,' +
    ' p.lng post_lng, p.post post_post, p.author post_author,' +
    ' postlet.postlet_id postlet_postlet_id, postlet.date_added postlet_date_added, postlet.lat postlet_lat,' +
    ' postlet.lng postlet_lng, postlet.post postlet_post, citation.cite_id citation_cite_id, citation.citation citation_citation' +
    ' FROM post p' +
    ' LEFT JOIN postlet ON p.post_id = postlet.post_id' +
    ' LEFT JOIN citation ON p.post_id = citation.post_id' +
    ' WHERE post_post_id = ?' +
    ' ORDER BY post_date_added DESC, postlet_date_added DESC, citation_citation ASC'

  let rows = db.prepare(query).all(id)
  let post = getSparsePost(rows[0])
  for(let i=0; i<rows.length; i++) {
    row = rows[i]
    post = buildPost(post, row)
  }

  return post
}

// Set up feeds
const feed = new rss({
  title: 'Where’s Lucian?',
  site_url: 'http://whereslucian.com',
  author: 'Lucian DiPeso'
})

const lucianReadsToSavannaFeed = new rss({
  title: 'Lucian Reads to Savanna',
  feed_url: 'http://whereslucian.com/feeds/lucian-reads-to-savanna',
  site_url: 'http://whereslucian.com',
  author: 'Lucian DiPeso',
  description: 'Lucian reading select stories to his darling love Savanna Atlas.',
  image_url: 'http://whereslucian.com/images/lucian_reads.jpg'
})

// Load templates
const templates = {
  essay: fs.readFileSync(path.join(__dirname, 'views', 'partials', 'essay.ejs'), 'utf-8'),
  travel: fs.readFileSync(path.join(__dirname, 'views', 'partials', 'travel.ejs'), 'utf-8'),
  video: fs.readFileSync(path.join(__dirname, 'views', 'partials', 'video.ejs'), 'utf-8')
}

wl.set('view engine', 'ejs')

// Set up SASS complilation
wl.use(
  sassMiddleware({
    src: __dirname + '/sass',
    dest: __dirname + '/public/style',
    debug: true,
    outputStyle: 'compressed',
    prefix: '/style'
  })
)
wl.use(express.static(path.join( __dirname, 'public' )))

wl.use(cookieParser())
wl.use(compression())

// Paths
wl.get('/about', function(req, res) {
  res.render('about')
})

wl.get('/projects', function(req, res) {
  res.render('projects')
})

wl.get('/videos', function(req, res) {
  if(!isOAuthenticated(req.cookies)) {
    let scopes = [
      'https://www.googleapis.com/auth/youtube.readonly'
    ]

    let url = oauth2.generateAuthUrl({
      scope: scopes,
      access_type: 'online'
    });

    res.redirect(url)
    return
  }

  let tokens = JSON.parse(req.cookies.oauth_token)
  oauth2.credentials = tokens
  getYouTubeVideos(function(err, lists) {
    res.render('videos', { 
      lists: lists,
      templates: templates
    })
  })
})

wl.get('/ajax/get-videos/:id/:pageToken', function(req, res) {
  let dirtyId = req.params.id || "";
  let id = validator.isInt(dirtyId, { min: 1 }) ? parseInt(dirtyId) : false

  let dirtyPageToken = req.params.pageToken || "";
  let pageToken = validator.isAlphanumeric(dirtyPageToken) && dirtyPageToken != "" ? dirtyPageToken : false
  if(!isOAuthenticated(req.cookies) || !pageToken || !id) {
    // TODO: Actually send proper headers
    res.send({
      err: 403,
      message: "Not authenticated"
    })
    return
  }

  let tokens = JSON.parse(req.cookies.oauth_token)
  oauth2.credentials = tokens
  getYouTubeVideosById(id, function(err, data) {
    res.send(data)
  }, pageToken)
})

wl.get('/oauth', function(req, res) {
  let authCode = req.query.code
  oauth2.getToken(authCode, function(err, tokens) {
    if (!err) {
      res.cookie('oauth_token', JSON.stringify(tokens), { expire: new Date(1513476373919) })
    }
    res.redirect('/videos')
  })
})

wl.get('/', function(req, res) {
  let posts = getPosts(0)

  res.render('index', { 
    posts: posts, 
    moment: moment, 
    page: 1,
    templates: templates
  })
})

wl.get('/:page', function(req, res) {
  let dirtyPage = req.params.page || 1;
  let page = validator.isInt(dirtyPage, { min: 1 }) ? parseInt(dirtyPage) : 1
  let offset = (page*2)-2
  let posts = getPosts(offset)
  res.render('index', { 
    posts: posts, 
    moment: moment, 
    page: page,
    templates: templates
  })
})

wl.get('/ajax/:page', function(req, res) {
  let dirtyPage = req.params.page || 1;
  let page = validator.isInt(dirtyPage, { min: 1 }) ? parseInt(dirtyPage) : 1
  let offset = (page*2)-2
  let posts = getPosts(offset)
  res.send({
    posts: posts
  })
})

wl.get('/post/:id', function(req, res) {
  let dirtyId = req.params.id || 1;
  let id = validator.isInt(dirtyId, { min: 1 }) ? parseInt(dirtyId) : 1
  let post = getPost(id)
  res.render('post', { 
    post: post, 
    moment: moment
  })
})

wl.get('/feeds/posts', function(req, res) {
  let posts = getPostList()
  for(let i=0,length=posts.length;i<length;i++) {
    let item = {
      title: posts[i].title,
      url: 'http://whereslucian.com/post/' + posts[i].id,
      author: posts[i].author,
      date: posts[i].dateAdded
    }
    if(posts[i].lat && posts[i].lng) {
      item.lat = posts[i].lat;
      item.long = posts[i].lng;
    }
    feed.item(item)
  }

  res.header('Content-Type', 'application/rss+xml');
  res.send(feed.xml());
})

wl.get('/feeds/lucian-reads-to-savanna', function(req, res) {
  lucianReadsToSavannaFeed.items = []

  let posts = getLucianReadsToSavannaList()
  for(let i=0,length=posts.length;i<length;i++) {
    let post = posts[i]
    let item = {
      guid: "I_Love_Savanna_Atlas:" + post.id,
      title: post.title,
      url: post.url,
      author: 'Lucian DiPeso',
      date: post.dateAdded,
      enclosure: { url: post.url, file: post.filePath }
    }
    lucianReadsToSavannaFeed.item(item)
  }

  res.header('Content-Type', 'application/rss+xml');
  res.send(lucianReadsToSavannaFeed.xml());
})

wl.listen(nconf.get('port') || 3000, function() {
  console.log('Listening')
})