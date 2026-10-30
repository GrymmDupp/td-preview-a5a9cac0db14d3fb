// EXAMPLE CONTENT for the local preview only. Every record is flagged is_example
// and the UI labels it "Example". None of these are real people or real recollections.
const d = (days, h = 12) => new Date(Date.now() - days * 864e5 - h * 36e5).toISOString();

export function seedData(listingIds) {
  const has = (id) => listingIds.includes(id);
  const pick = (...ids) => ids.find(has) || listingIds[0];
  const L1 = pick('holliday-house'), L2 = pick('eloise-complex'), L3 = pick('emmons-mansion'), L4 = pick('ionia-prohibition'), L5 = pick('gratiot-funeral');
  const A = (id, handle, role = 'user') => ({ id, handle, role, created_at: d(40), is_example: true });
  const accounts = [A('ex_mod', 'example-moderator', 'moderator'), A('ex_ash', 'example-ash'), A('ex_birch', 'example-birch'), A('ex_cedar', 'example-cedar')];
  const ok = { status: 'approved', is_example: true };

  // DATA: submissions. Approved ones are part of the listing's full file.
  const S = (id, kind, listing_id, author_id, payload, o = {}) => ({ id, kind, listing_id, author_id, payload, rights_confirmed: kind === 'photo', is_sample: false, ...ok, created_at: d(4), ...o });
  const submissions = [
    S('ex_s1', 'lore', L1, 'ex_birch', { title: 'Example lore: the drawer story', text: 'Example placeholder lore. A real submission would retell a local story about the house, say who told it and when, and label it as a story, not a fact.', relation: 'grew-up-near', era: '1990s' }, { created_at: d(6) }),
    S('ex_s2', 'photo', L1, 'ex_ash', { title: 'Example photo: front elevation from the sidewalk', caption: 'Example placeholder for a contributor’s own photo, taken from public ground.', credit: 'example-ash', doc_type: 'photo', era: 'current' }, { is_sample: true, created_at: d(5) }),
    S('ex_s3', 'photo', L1, 'ex_cedar', { title: 'Example document: 1930s postcard', caption: 'Example placeholder for a public-domain postcard scan.', credit: 'example-cedar', doc_type: 'postcard', era: 'historic' }, { created_at: d(3) }),
    S('ex_s4', 'info', L1, 'ex_cedar', { field: 'history', text: 'Example correction: a city directory would show the funeral-home years. Placeholder text only.', sources: 'Example source: city directory, year and page.' }, { created_at: d(2) }),
    S('ex_s5', 'link', L1, 'ex_ash', { url: 'https://example.com/archive-item', label: 'Example source link (placeholder)', why: 'Example: a digitised newspaper page about the sale.' }, { created_at: d(2, 3) }),
    S('ex_s6', 'photo', L2, 'ex_ash', { title: 'Example photo: gate from the public road', caption: 'Example placeholder; marked as a free-preview sample by a moderator.', credit: 'example-ash', doc_type: 'photo', era: 'current' }, { is_sample: true }),
    S('ex_s7', 'lore', L5, 'ex_birch', { title: 'Example lore waiting for review', text: 'Example pending item, so the moderation queue has a submission in it.', relation: 'family', era: '1970s' }, { status: 'pending', created_at: d(0, 3) }),
    S('ex_s8', 'link', null, 'ex_cedar', { url: 'https://example.com/listing', label: 'Example: suggested new property', why: 'Example suggestion of a listing with a documented history. Placeholder only.', place: 'Example County, OH', new_property: true }, { status: 'pending', created_at: d(0, 5) }),
  ];

  // SOCIAL (a): comments on listings, one level of replies.
  const C = (id, listing_id, author_id, body, h, o = {}) => ({ id, listing_id, parent_id: null, author_id, body, ...ok, created_at: d(1, h), ...o });
  const comments = [
    C('ex_c1', L1, 'ex_birch', 'Example comment: which city directories cover the funeral-home years? Placeholder text.', 30),
    C('ex_c2', L1, 'ex_mod', 'Example reply from the moderator account: please add page numbers when you cite a directory.', 20, { parent_id: 'ex_c1' }),
    C('ex_c3', L1, 'ex_ash', 'Example comment: drove past on a walking tour, viewed from the sidewalk only.', 8),
    C('ex_c4', L2, 'ex_cedar', 'Example comment about public burial registers. Placeholder.', 40),
    C('ex_c5', L1, 'ex_cedar', 'Example comment waiting for review.', 1, { status: 'pending', created_at: d(0, 1) }),
  ];

  // SOCIAL (b): the one general board. parent_id = reply.
  const B = (id, author_id, title, body, h, o = {}) => ({ id, parent_id: null, author_id, title, body, ...ok, created_at: d(2, h), ...o });
  const board = [
    B('ex_b1', 'ex_ash', 'Example post: best free sources for old city directories?', 'Example board post. Placeholder text about where to find digitised directories.', 10),
    B('ex_b2', 'ex_birch', '', 'Example reply: many county libraries have them on microfilm.', 6, { parent_id: 'ex_b1' }),
    B('ex_b3', 'ex_mod', '', 'Example reply from the moderator account: please link sources, not screenshots.', 4, { parent_id: 'ex_b1' }),
    B('ex_b4', 'ex_cedar', 'Example post: tips for photographing from public ground', 'Example board post. Placeholder text about lenses, sidewalks and not bothering occupants.', 30, { created_at: d(4) }),
    B('ex_b5', 'ex_birch', 'Example board post waiting for review', 'Example pending post, so the queue shows board items.', 1, { status: 'pending', created_at: d(0, 2) }),
  ];
  const reports = [{ id: 'ex_rep1', target_type: 'comment', target_id: 'ex_c4', reason: 'doxxing', details: 'Example report: names a living neighbour (placeholder).', reporter_id: 'ex_ash', status: 'open', created_at: d(0, 4), is_example: true }];
  return { accounts, unlocks: [], submissions, comments, board, reports };
}
