# Radio ambience: audio sources and licenses

The optional "old radio in the next room" ambience (off by default; started only by a tap; never on
`/live/`) plays short excerpts of the recordings below. Every file is **public domain in the United
States** and is marked Public Domain on Wikimedia Commons. Files were trimmed to a 110-second excerpt,
loudness-normalised, faded, and re-encoded as mono MP3 (40 kbps, 22.05 kHz) into `assets/audio/`.
They are lazy-loaded when the radio is switched on and are not in the offline precache. Web Audio adds
the "through a wall" sound (low-pass, telephone EQ, small room, hiss/crackle) at play time; the files
themselves are not altered beyond the trim/encode.

Why these are public domain:
- **US sound recordings published before 1926** are in the US public domain (Music Modernization Act:
  pre-1923 recordings entered the public domain on 1 Jan 2022; recordings first published 1923-1925
  entered it 100 years after publication, i.e. by 1 Jan 2026). All compositions below were published
  before 1926 (or are traditional), so the underlying works are also public domain in the US.
- **US Air Force Band recordings** are works of the United States Government (17 U.S.C. § 105) and are
  public domain in the US.

| File | Recording | Year | Source (Wikimedia Commons) | License |
|---|---|---|---|---|
| radio-rose.mp3 | "Rose Room", Joseph C. Smith's Orchestra, Victor 18473 | 1918 | https://commons.wikimedia.org/wiki/File:%22Rose_Room%22_-_Joseph_C._Smith%27s_Orchestra_-_Victor_18473_(B-21882-2)_6-3-1918.oga | Public domain (US, pre-1926 recording) |
| radio-sandman.mp3 | "The Japanese Sandman", Paul Whiteman and His Ambassador Orchestra | 1920 | https://commons.wikimedia.org/wiki/File:%22The_Japanese_Sandman%22_(1920),_by_Paul_Whiteman_and_His_Ambassador_Orchestra.oga | Public domain (US, pre-1926 recording) |
| radio-homesick.mp3 | "Homesick", Ted Lewis and his Band | 1922 | https://commons.wikimedia.org/wiki/File:Homesick_Ted_Lewis_and_his_Band.ogg | Public domain (US, pre-1926 recording) |
| radio-oneilove.mp3 | "The One I Love (Belongs to Somebody Else)", Harry Raderman's Dance Orchestra, Edison | 1924 | https://commons.wikimedia.org/wiki/File:The_One_I_Love_(Belongs_to_Somebody_Else)_-_(Edison,_1924).flac | Public domain (US, pre-1926 recording) |
| radio-three.mp3 | "Three O'Clock in the Morning" (waltz), Bar Harbor Society Orchestra, Vocalion | c.1922 | https://commons.wikimedia.org/wiki/File:Vocalion-b14287-8401.ogg | Public domain (US, pre-1926 recording) |
| radio-danse.mp3 | Saint-Saëns, "Danse macabre", Philadelphia Orchestra, Leopold Stokowski, Victor 6505 | 1925 | https://commons.wikimedia.org/wiki/File:PhiladelphiaSymphonyOrchestra-DanseMacabre.ogg | Public domain (US, pre-1926 recording) |
| radio-godrest.mp3 | "God Rest You Merry, Gentlemen", The Carol Singers, Edison | 1917 | https://commons.wikimedia.org/wiki/File:God_Rest_You_Merry,_Gentlemen.ogg | Public domain (US, pre-1926 recording; traditional carol) |
| radio-silent.mp3 | "Silent Night", Starlifter and Roots in Blue, US Air Force Band of Mid-America | 2020 | https://commons.wikimedia.org/wiki/File:Silent_Night_(2020)_-_Starlifter_and_Roots_in_Blue_-_United_States_Air_Force_Band_of_Mid-America.mp3 | Public domain (US Government work) |
| radio-holy.mp3 | "O Holy Night", Starlifter and Roots in Blue, US Air Force Band of Mid-America | 2020 | https://commons.wikimedia.org/wiki/File:O_Holy_Night_(2020)_-_Starlifter_and_Roots_in_Blue_-_United_States_Air_Force_Band_of_Mid-America.mp3 | Public domain (US Government work) |
| radio-jingle.mp3 | "Jingle Bells", Starlifter and Roots in Blue, US Air Force Band of Mid-America | 2020 | https://commons.wikimedia.org/wiki/File:Jingle_Bells_(2020)_-_Starlifter_and_Roots_in_Blue_-_United_States_Air_Force_Band_of_Mid-America.mp3 | Public domain (US Government work) |

No CC-BY files are used, so no attribution is legally required; the app footer still carries a short
credits line linking here.

## Seasonal playlists (chosen from the device date, `js/radio.js`)

| Season | Months | Tracks |
|---|---|---|
| Hallowe'en | October | Danse macabre (1925), The Japanese Sandman, Rose Room |
| Late autumn | November | The One I Love, Three O'Clock in the Morning, The Japanese Sandman, Homesick, Rose Room |
| Christmas | December | Silent Night, God Rest You Merry Gentlemen (1917), O Holy Night, Jingle Bells |
| Winter fireside | January-February | Three O'Clock in the Morning, The One I Love, Rose Room |
| Evening dance band | March-September (and fallback) | Rose Room, The Japanese Sandman, Homesick, The One I Love |

A season with fewer than three verified tracks is topped up from the general list. Nothing from any
YouTube "oldies in another room" video, and no copyrighted recording, is used.

Note: "public domain" here is US public domain. Some pre-1926 recordings may still be protected in
other countries.
