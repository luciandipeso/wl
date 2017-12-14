const compression = require('compression')
const express = require('express')
const wl = express()
const sassMiddleware = require('node-sass-middleware')
const fs = require('fs')
const async = require('async')
const path = require('path')
const Database = require('better-sqlite3')
const rss = require('rss')
const validator = require('validator')
const nconf = require('nconf')
const moment = require('moment')

nconf.argv()
     .env()


const env = ["prod", "dev"].includes(nconf.get('NODE_ENV')) ? nconf.get('NODE_ENV') : "dev"
nconf.file({ file: path.join(__dirname, "conf", env + ".conf.json") })

const dbFile = path.join(__dirname, nconf.get('dbPath'), nconf.get('dbFile')) || "wl.db"
const db = new Database(dbFile, { readonly: true });

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
    ' ORDER BY p.date_added DESC, postlet.date_added DESC, citation.citation ASC'

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
  let query = 'SELECT * FROM post' +
    ' LEFT JOIN postlet ON post.post_id = postlet.post_id' +
    ' LEFT JOIN citation ON post.post_id = citation.post_id' +
    ' WHERE post.post_id = ? postlet.date_added DESC, citation.citation ASC'

  let rows = db.prepare(query).all(id)
  let post = getSparsePost(row)
  for(let i=0; i<rows.length; i++) {
    row = rows[i]
    post = buildPost(post, row)
  }

  return post
}

wl.set('view engine', 'ejs')

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
wl.use(compression())

wl.get('/', function(req, res) {
  let posts = getPosts(0)
  res.render('index', { posts: posts, moment: moment })
})

wl.listen(3000, function() {
  console.log('Listening')
})