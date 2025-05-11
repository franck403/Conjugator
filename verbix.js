// Import necessary libraries
import * as R from 'https://cdn.jsdelivr.net/npm/ramda@0.28.0/+esm';
import { AllHtmlEntities } from 'https://cdn.jsdelivr.net/npm/html-entities@2.3.3/lib/index.es6.js'; 

// Initialize entities for decoding HTML entities
const entities = new AllHtmlEntities();

// Helper function to get children of an element
const getChildren = R.propOr([], 'children');

// DOMParser-based HTML parsing function
function parseHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes); // Return all child nodes of the body
}

// Extract the title from the HTML structure
const extractTitle = R.pipe(
  getChildren,
  R.find(
    R.pipe(
      R.propOr('', 'name'),
      R.contains(R.__, ['h1', 'h2', 'h3'])
    )
  ),
  getChildren,
  R.find(R.propEq('type', 'text')),
  R.propOr('', 'data'),
  function (t) {
    return t.replace(/\s+/g, '_');
  },
  R.toLower
);

// Recursive search of elements based on a predicate
const recursiveElSearch = R.curry(function (predicate, elements) {
  return R.pipe(
    R.map(
      R.cond([
        [predicate, R.identity],
        [R.T, R.pipe(getChildren, recursiveElSearch(predicate))]
      ])
    ),
    R.unnest
  )(elements);
});

// Find span elements recursively
const getSpans = recursiveElSearch(R.propEq('name', 'span'));

// Split array based on a predicate
const splitOn = R.curry(function (predicate, arr) {
  return R.reduce(function (acc, val) {
    return predicate(val)
      ? R.concat(acc, [[]])
      : R.concat(R.init(acc), [R.concat(R.last(acc), [val])]);
  }, [[]], arr);
});

// Extract text from span elements
const extractTextFromSpan = R.pipe(
  getChildren,
  R.head,
  R.propOr('', 'data'),
  entities.decode,
  R.trim
);

// Summarize a tense table
const summarizeTenseTable = function (el) {
  const getPronounConjugationMap = R.pipe(
    getChildren,
    R.find(R.propEq('name', 'p')),
    getChildren,
    splitOn(R.propEq('name', 'br')),
    R.map(getSpans),
    R.map(R.partition(R.pipe(R.prop('parent'), R.prop('name'), R.equals('font')))),
    R.map(R.map(R.map(extractTextFromSpan))),
    R.map(R.pipe(function (row) {
      const articles = row[0];
      const conjugations = row[1];
      return R.map(function (article) {
        return [article, conjugations];
      })(articles);
    })),
    R.unnest,
    R.filter(R.pipe(R.length, R.gte(R.__, 2))),
    R.fromPairs
  );

  return R.assoc(extractTitle(el), getPronounConjugationMap(el), {});
};

// Predicate for mood elements
const moodElPredicate = R.pipe(
  R.path(['attribs', 'class']),
  R.equals('pure-u-1-1 pure-u-lg-1-2')
);

// Predicate for tense elements
const tenseElPredicate = R.pipe(
  R.path(['attribs', 'class']),
  R.equals('pure-u-1-2')
);

// Summarize a mood table
const summarizeMoodTable = function (el) {
  const getTenseTables = R.pipe(
    getChildren,
    recursiveElSearch(tenseElPredicate)
  );

  const summarizeTenseTables = R.pipe(
    getTenseTables,
    R.map(summarizeTenseTable),
    R.reduce(R.merge, {})
  );

  return R.assoc(
    extractTitle(el),
    summarizeTenseTables(el),
    {}
  );
};

// Summarize the entire page
const summarizePage = R.pipe(
  recursiveElSearch(moodElPredicate),
  R.map(summarizeMoodTable),
  R.reduce(R.merge, {})
);

// Export the processing pipeline
export const processHTML = R.pipeP(
  parseHTML,
  summarizePage
);

// CORS proxy URL to bypass CORS issues
const corsProxyUrl = 'https://cors-anywhere.herokuapp.com/'; // Public CORS proxy

// Curried function for conjugating verbs using WebVerbix
export const conjugate = R.curry(async function (language, verb) {
  const url = `http://www.verbix.com/webverbix/${language}/${verb}.html`;

  try {
    // Make the request with fetch using the CORS proxy
    const response = await fetch(corsProxyUrl + url);
    const body = await response.text();
    
    // Apply the scrape function to the response body
    return processHTML(body);
  } catch (err) {
    console.error('Error fetching verb data:', err);
    throw err;
  }
});

// Example Usage: Get conjugation data for a verb in a language
conjugate('english', 'run')
  .then(result => {
    console.log(result); // Log the conjugation result
  })
  .catch(error => {
    console.error('Error:', error); // Handle errors
  });
