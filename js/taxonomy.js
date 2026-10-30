// Every label and color in one place. Unknown values never throw: they fall back
// to a neutral label made from the raw value, so new feed values render on day one.

// Internal grade keys (from the feed). Never rendered: the public site shows only the
// rating badge (Twisted Deed / Strong Story), see PUBLIC_TIER1 / storyLabel below.
export const GRADES = {
  death:     { label: 'Twisted Deed', icon: '', color: '#c41e32', tier: 1 },
  diseased:  { label: 'Twisted Deed', icon: '', color: '#8fb33a', tier: 1 },
  split:     { label: 'Twisted Deed', icon: '', color: '#d2457a', tier: 1 },
  sovereign: { label: 'Twisted Deed', icon: '', color: '#ff4a4a', tier: 1 },
  story:     { label: 'Strong Story', icon: '', color: '#cbbd9f', tier: 2 },
};

export const TIERS = {
  1: { key: 'triple-d', label: 'Twisted Deed', long: 'Murder, crime, mayhem and the darkest records' },
  2: { key: 'story', label: 'Strong Story', long: 'Architectural oddities, lore-heavy vacancies, folklore, failed attractions, closed institutions, heritage' },
};

// Public display names. The internal keys (grade, tier, storyCategory) are unchanged;
// the site never shows the internal grade letters or their emoji string.
export const PUBLIC_TIER1 = 'Twisted Deed';
export const PUBLIC_TIER2 = 'Strong Story';
const STORY_CATS = { oddity: 'Architecture & Oddity', folklore: 'Folklore', attraction: 'Failed Attraction', heritage: 'Heritage', 'long-vacant': 'Long-Vacant', research: 'Heritage' };
// Sub-label for a Strong Story badge (storyCategory, else the layer). Empty for tier 1.
export const storyLabel = (l) => l.tier === 1 ? '' : (STORY_CATS[l.storyCategory] || (LAYERS[l.layer]?.tier === 2 ? { oddity: 'Architecture & Oddity', folklore: 'Folklore', attraction: 'Failed Attraction', heritage: 'Heritage' }[l.layer] : '') || '');
export const ratingLabel = (l) => l.tier === 1 ? PUBLIC_TIER1 : PUBLIC_TIER2 + (storyLabel(l) ? ' · ' + storyLabel(l) : '');
// Labels for the contribute form's "what kind of story" choice (values stay internal keys).
export const CONTRIB_GRADE_LABELS = { death: 'Twisted Deed: a death, murder or violent crime', diseased: 'Twisted Deed: asylum, sanatorium or epidemic history', split: 'Twisted Deed: scandal or stigma', story: 'Strong Story: architecture, folklore, failed attraction, heritage or long-vacant' };

// Map/category layers. Colors follow Grymm's brief; media and record keep Field Desk's own.
export const LAYERS = {
  spectral:   { label: 'Paranormal',        color: '#9d4dff', tier: 1 },
  mortuary:   { label: 'Mortuary',          color: '#6a2fa8', tier: 1 },
  vice:       { label: 'Vice',              color: '#ffbf00', tier: 1 },
  mayhem:     { label: 'Murder & Mayhem',   color: '#dc143c', tier: 1 },
  blight:     { label: 'Blight',            color: '#708090', tier: 1 },
  media:      { label: 'In the Media',      color: '#c6a35a', tier: 1 },
  record:     { label: 'Historic Record',   color: '#d2bce8', tier: 1 },
  oddity:     { label: 'Architectural Oddity', color: '#1fa89c', tier: 2 },
  folklore:   { label: 'Folklore & Legend', color: '#6b8e23', tier: 2 },
  attraction: { label: 'Failed Attraction', color: '#cc5500', tier: 2 },
  heritage:   { label: 'Heritage',          color: '#c9a227', tier: 2 },
};

export const STATUSES = {
  Active:  { label: 'Active',  cls: 'ok' },
  Pending: { label: 'Pending', cls: 'warn' },
  Sold:    { label: 'Sold',    cls: 'off' },
  Stale:   { label: 'Unverified', cls: 'off' },
  Watch:   { label: 'To watch', cls: 'warn' },
};

export const KINDS = { house: 'House', commercial: 'Commercial', investment: 'Land & investment' };

export const PRICE_BANDS = [
  { key: 'u100',  label: 'Under $100k',  min: 0,       max: 100000 },
  { key: 'u250',  label: '$100k–$250k',  min: 100000,  max: 250000 },
  { key: 'u500',  label: '$250k–$500k',  min: 250000,  max: 500000 },
  { key: 'u1m',   label: '$500k–$1M',    min: 500000,  max: 1000000 },
  { key: 'o1m',   label: '$1M+',         min: 1000000, max: Infinity },
  { key: 'ask',   label: 'Auction / ask', min: null,   max: null },
];

export const STATES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',PR:'Puerto Rico'};

const titleize = (v) => String(v ?? '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unlisted';
const hashColor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 25% 55%)`; };

export const gradeInfo = (g) => GRADES[g] || { label: titleize(g), icon: '◆', color: '#a3967f', tier: null, unknown: true };
export const layerInfo = (l) => LAYERS[l] || { label: titleize(l), color: hashColor(l), tier: null, unknown: true };
export const statusInfo = (s) => STATUSES[s] || { label: titleize(s), cls: 'off' };
export const kindLabel = (k) => KINDS[k] || titleize(k);
export const tierInfo = (t) => TIERS[t] || TIERS[2];
