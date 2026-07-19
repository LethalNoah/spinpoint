// Question bank: 6 genres × 12 questions (4 easy, 4 medium, 4 hard).
// Format: d = difficulty (1 easy, 2 medium, 3 hard), q = question text,
// c = 4 choices, a = index of correct choice,
// city = name shown in the map phase, lat/lon = true location.

const GENRES = [
  { name: "History",        color: "#e5533d", icon: "🏛️" },
  { name: "Science",        color: "#3d9be5", icon: "🔬" },
  { name: "Sports",         color: "#43b649", icon: "🏅" },
  { name: "Food & Drink",   color: "#e5a13d", icon: "🍜" },
  { name: "Arts & Music",   color: "#a04de5", icon: "🎭" },
  { name: "Pop Culture",    color: "#e54d9b", icon: "🎬" },
];

const QUESTIONS = {
  "History": [
    // easy
    { d: 1, q: "In what year did the Berlin Wall fall?", c: ["1985", "1989", "1991", "1993"], a: 1, city: "Berlin", lat: 52.52, lon: 13.405 },
    { d: 1, q: "The Storming of the Bastille in 1789 kicked off which revolution?", c: ["American", "Russian", "Industrial", "French"], a: 3, city: "Paris", lat: 48.8566, lon: 2.3522 },
    { d: 1, q: "The Boston Tea Party was a protest against taxes imposed by which country?", c: ["France", "Spain", "Britain", "Netherlands"], a: 2, city: "Boston", lat: 42.3601, lon: -71.0589 },
    { d: 1, q: "Which city was the first target of an atomic bomb in warfare?", c: ["Nagasaki", "Tokyo", "Hiroshima", "Osaka"], a: 2, city: "Hiroshima", lat: 34.3853, lon: 132.4553 },
    // medium
    { d: 2, q: "The ancient Colosseum could hold roughly how many spectators?", c: ["10,000", "25,000", "50,000", "150,000"], a: 2, city: "Rome", lat: 41.9028, lon: 12.4964 },
    { d: 2, q: "Which empire was ruled from Tenochtitlan, the city now buried beneath Mexico City?", c: ["Inca", "Maya", "Aztec", "Olmec"], a: 2, city: "Mexico City", lat: 19.4326, lon: -99.1332 },
    { d: 2, q: "Which pharaoh's nearly intact tomb was discovered in 1922 near Luxor?", c: ["Ramses II", "Tutankhamun", "Khufu", "Akhenaten"], a: 1, city: "Luxor", lat: 25.6872, lon: 32.6396 },
    { d: 2, q: "The shot that sparked World War I was fired in which city in 1914?", c: ["Vienna", "Belgrade", "Sarajevo", "Budapest"], a: 2, city: "Sarajevo", lat: 43.8563, lon: 18.4131 },
    // hard
    { d: 3, q: "The 1945 conference that divided post-war Europe was held in which Crimean city?", c: ["Yalta", "Odessa", "Sevastopol", "Sochi"], a: 0, city: "Yalta", lat: 44.4952, lon: 34.1663 },
    { d: 3, q: "Nelson Mandela was inaugurated as South Africa's president in 1994 in which city?", c: ["Cape Town", "Johannesburg", "Pretoria", "Durban"], a: 2, city: "Pretoria", lat: -25.7479, lon: 28.2293 },
    { d: 3, q: "The treaty ending World War I was signed in 1919 at a palace in which town near Paris?", c: ["Fontainebleau", "Versailles", "Vincennes", "Compiègne"], a: 1, city: "Versailles", lat: 48.8049, lon: 2.1204 },
    { d: 3, q: "Genghis Khan's Mongol Empire was ruled from which capital city?", c: ["Ulaanbaatar", "Samarkand", "Karakorum", "Kashgar"], a: 2, city: "Karakorum", lat: 47.1975, lon: 102.8464 },
  ],
  "Science": [
    // easy
    { d: 1, q: "NASA's Mission Control for crewed spaceflights is located in which city?", c: ["Cape Canaveral", "Houston", "Washington D.C.", "Los Angeles"], a: 1, city: "Houston", lat: 29.7604, lon: -95.3698 },
    { d: 1, q: "CERN's Large Hadron Collider sits beneath the border near which city?", c: ["Zurich", "Geneva", "Lyon", "Bern"], a: 1, city: "Geneva", lat: 46.2044, lon: 6.1432 },
    { d: 1, q: "Isaac Newton developed his laws of motion at a university in which city?", c: ["Oxford", "London", "Cambridge", "Edinburgh"], a: 2, city: "Cambridge", lat: 52.2053, lon: 0.1218 },
    { d: 1, q: "Penicillin was discovered by Alexander Fleming in 1928 at a hospital in which city?", c: ["Glasgow", "Manchester", "Dublin", "London"], a: 3, city: "London", lat: 51.5074, lon: -0.1278 },
    // medium
    { d: 2, q: "The first human spaceflight in 1961 launched from a cosmodrome near which city?", c: ["Moscow", "Baikonur", "Volgograd", "Almaty"], a: 1, city: "Baikonur", lat: 45.6167, lon: 63.3167 },
    { d: 2, q: "Marie Curie won her Nobel Prizes while working in which city?", c: ["Warsaw", "Vienna", "Paris", "Berlin"], a: 2, city: "Paris", lat: 48.8566, lon: 2.3522 },
    { d: 2, q: "The world's first successful human heart transplant was performed in 1967 in which city?", c: ["London", "New York", "Cape Town", "Sydney"], a: 2, city: "Cape Town", lat: -33.9249, lon: 18.4241 },
    { d: 2, q: "Which element is named after the city that hosts the Niels Bohr Institute?", c: ["Hafnium", "Holmium", "Both of these", "Neither"], a: 2, city: "Copenhagen", lat: 55.6761, lon: 12.5683 },
    // hard
    { d: 3, q: "The magnitude scale for earthquakes was developed by Charles Richter at Caltech, located in which city?", c: ["San Francisco", "Pasadena", "San Diego", "Seattle"], a: 1, city: "Pasadena", lat: 34.1478, lon: -118.1445 },
    { d: 3, q: "Darwin's famous finches live on islands governed by the country whose capital is Quito. Which country?", c: ["Peru", "Ecuador", "Colombia", "Chile"], a: 1, city: "Quito", lat: -0.1807, lon: -78.4678 },
    { d: 3, q: "Dmitri Mendeleev devised the periodic table while a professor in which city?", c: ["Moscow", "Kazan", "St. Petersburg", "Kyiv"], a: 2, city: "St. Petersburg", lat: 59.9311, lon: 30.3609 },
    { d: 3, q: "FAST, the world's largest single-dish radio telescope, is in the mountains near which Chinese city?", c: ["Chengdu", "Guiyang", "Kunming", "Xi'an"], a: 1, city: "Guiyang", lat: 26.647, lon: 106.6302 },
  ],
  "Sports": [
    // easy
    { d: 1, q: "Wimbledon, tennis's oldest tournament, is played in which city?", c: ["Manchester", "London", "Birmingham", "Edinburgh"], a: 1, city: "London", lat: 51.5074, lon: -0.1278 },
    { d: 1, q: "The Tour de France traditionally finishes on the Champs-Élysées in which city?", c: ["Lyon", "Marseille", "Nice", "Paris"], a: 3, city: "Paris", lat: 48.8566, lon: 2.3522 },
    { d: 1, q: "The 2008 Summer Olympics, famous for the 'Bird's Nest' stadium, were hosted by which city?", c: ["Shanghai", "Beijing", "Seoul", "Tokyo"], a: 1, city: "Beijing", lat: 39.9042, lon: 116.4074 },
    { d: 1, q: "The Maracanã, once the world's largest football stadium, is in which city?", c: ["São Paulo", "Buenos Aires", "Rio de Janeiro", "Lima"], a: 2, city: "Rio de Janeiro", lat: -22.9068, lon: -43.1729 },
    // medium
    { d: 2, q: "The first modern Olympic Games in 1896 were held in which city?", c: ["Rome", "Paris", "Athens", "London"], a: 2, city: "Athens", lat: 37.9838, lon: 23.7275 },
    { d: 2, q: "Which city's marathon is the world's largest by number of finishers?", c: ["Boston", "Berlin", "New York", "Chicago"], a: 2, city: "New York", lat: 40.7128, lon: -74.006 },
    { d: 2, q: "Camp Nou, Europe's largest football stadium, is home to which city's club?", c: ["Madrid", "Barcelona", "Lisbon", "Milan"], a: 1, city: "Barcelona", lat: 41.3874, lon: 2.1686 },
    { d: 2, q: "Sumo wrestling's most prestigious tournaments are held in which city?", c: ["Kyoto", "Osaka", "Tokyo", "Nagoya"], a: 2, city: "Tokyo", lat: 35.6762, lon: 139.6503 },
    // hard
    { d: 3, q: "Muhammad Ali's 'Rumble in the Jungle' took place in 1974 in which city?", c: ["Lagos", "Kinshasa", "Nairobi", "Accra"], a: 1, city: "Kinshasa", lat: -4.4419, lon: 15.2663 },
    { d: 3, q: "The Melbourne Cup is a famous race in which sport?", c: ["Sailing", "Horse racing", "Cricket", "Rowing"], a: 1, city: "Melbourne", lat: -37.8136, lon: 144.9631 },
    { d: 3, q: "Which city hosted the very first FIFA World Cup in 1930?", c: ["Buenos Aires", "Rome", "Montevideo", "Rio de Janeiro"], a: 2, city: "Montevideo", lat: -34.9011, lon: -56.1645 },
    { d: 3, q: "The Iditarod sled dog race ends after nearly 1,000 miles in which Alaskan city?", c: ["Anchorage", "Fairbanks", "Nome", "Juneau"], a: 2, city: "Nome", lat: 64.5011, lon: -165.4064 },
  ],
  "Food & Drink": [
    // easy
    { d: 1, q: "Which pizza style, with a thin base and simple toppings, is named after its city of origin?", c: ["Sicilian", "Neapolitan", "Roman", "Venetian"], a: 1, city: "Naples", lat: 40.8518, lon: 14.2681 },
    { d: 1, q: "Sushi's global boom started from Tsukiji, the famous fish market of which city?", c: ["Osaka", "Kyoto", "Tokyo", "Sapporo"], a: 2, city: "Tokyo", lat: 35.6762, lon: 139.6503 },
    { d: 1, q: "The croissant as we know it was popularized in which city?", c: ["Vienna", "Brussels", "Paris", "Geneva"], a: 2, city: "Paris", lat: 48.8566, lon: 2.3522 },
    { d: 1, q: "Guinness stout has been brewed at St. James's Gate since 1759 in which city?", c: ["Belfast", "Cork", "Dublin", "Liverpool"], a: 2, city: "Dublin", lat: 53.3498, lon: -6.2603 },
    // medium
    { d: 2, q: "Pho is a noodle soup that originated in which country's capital, Hanoi?", c: ["Thailand", "Vietnam", "Laos", "Cambodia"], a: 1, city: "Hanoi", lat: 21.0285, lon: 105.8542 },
    { d: 2, q: "Dim sum culture, served from rolling carts with tea, is most associated with which city?", c: ["Beijing", "Shanghai", "Hong Kong", "Taipei"], a: 2, city: "Hong Kong", lat: 22.3193, lon: 114.1694 },
    { d: 2, q: "Which city is famous for inventing the Sacher-Torte chocolate cake?", c: ["Munich", "Vienna", "Prague", "Zurich"], a: 1, city: "Vienna", lat: 48.2082, lon: 16.3738 },
    { d: 2, q: "'Hot chicken', cayenne-lacquered fried chicken, is the signature dish of which US city?", c: ["Memphis", "Nashville", "Atlanta", "New Orleans"], a: 1, city: "Nashville", lat: 36.1627, lon: -86.7816 },
    // hard
    { d: 3, q: "Tagine, a slow-cooked stew named after its clay pot, is a signature dish of which city's cuisine?", c: ["Cairo", "Marrakesh", "Tunis", "Istanbul"], a: 1, city: "Marrakesh", lat: 31.6295, lon: -7.9811 },
    { d: 3, q: "The asado barbecue tradition, built on beef from the pampas, centers on which capital city?", c: ["Santiago", "Montevideo", "Buenos Aires", "Asunción"], a: 2, city: "Buenos Aires", lat: -34.6037, lon: -58.3816 },
    { d: 3, q: "Khachapuri, a cheese-filled bread boat, is the pride of which country's capital, Tbilisi?", c: ["Armenia", "Georgia", "Azerbaijan", "Turkey"], a: 1, city: "Tbilisi", lat: 41.7151, lon: 44.8271 },
    { d: 3, q: "Ceviche, raw fish cured in citrus, is the national dish of the country whose capital is which city?", c: ["Lima", "Bogotá", "Quito", "Santiago"], a: 0, city: "Lima", lat: -12.0464, lon: -77.0428 },
  ],
  "Arts & Music": [
    // easy
    { d: 1, q: "The Mona Lisa hangs in the Louvre, located in which city?", c: ["Rome", "Paris", "Madrid", "Florence"], a: 1, city: "Paris", lat: 48.8566, lon: 2.3522 },
    { d: 1, q: "The Beatles formed in the early 1960s in which English city?", c: ["Manchester", "London", "Liverpool", "Birmingham"], a: 2, city: "Liverpool", lat: 53.4084, lon: -2.9916 },
    { d: 1, q: "K-pop's biggest agencies and music scene are based in which city?", c: ["Busan", "Tokyo", "Seoul", "Incheon"], a: 2, city: "Seoul", lat: 37.5665, lon: 126.978 },
    { d: 1, q: "The Bolshoi Ballet is a world-famous company based in which city?", c: ["St. Petersburg", "Moscow", "Kyiv", "Prague"], a: 1, city: "Moscow", lat: 55.7558, lon: 37.6173 },
    // medium
    { d: 2, q: "Mozart was born in 1756 in which Austrian city?", c: ["Vienna", "Graz", "Salzburg", "Innsbruck"], a: 2, city: "Salzburg", lat: 47.8095, lon: 13.055 },
    { d: 2, q: "Michelangelo's David is displayed in the Galleria dell'Accademia in which city?", c: ["Rome", "Florence", "Venice", "Milan"], a: 1, city: "Florence", lat: 43.7696, lon: 11.2558 },
    { d: 2, q: "Tango music and dance originated in the working-class ports of which city?", c: ["Rio de Janeiro", "Havana", "Buenos Aires", "Seville"], a: 2, city: "Buenos Aires", lat: -34.6037, lon: -58.3816 },
    { d: 2, q: "Reggae music was born in the 1960s in which city?", c: ["Havana", "Port-au-Prince", "Kingston", "Nassau"], a: 2, city: "Kingston", lat: 17.9712, lon: -76.7936 },
    // hard
    { d: 3, q: "The Sydney Opera House was designed by an architect from which country?", c: ["Australia", "Denmark", "Finland", "Britain"], a: 1, city: "Sydney", lat: -33.8688, lon: 151.2093 },
    { d: 3, q: "Van Gogh painted 'The Starry Night' while staying in an asylum in which country?", c: ["Netherlands", "Belgium", "France", "Switzerland"], a: 2, city: "Saint-Rémy-de-Provence", lat: 43.7889, lon: 4.8317 },
    { d: 3, q: "Edvard Munch, painter of 'The Scream', spent most of his life in which city?", c: ["Stockholm", "Copenhagen", "Oslo", "Bergen"], a: 2, city: "Oslo", lat: 59.9139, lon: 10.7522 },
    { d: 3, q: "Teatro di San Carlo, the world's oldest continuously active opera house, is in which city?", c: ["Milan", "Venice", "Naples", "Vienna"], a: 2, city: "Naples", lat: 40.8518, lon: 14.2681 },
  ],
  "Pop Culture": [
    // easy
    { d: 1, q: "Hollywood, the heart of the American film industry, is a district of which city?", c: ["San Francisco", "Los Angeles", "Las Vegas", "San Diego"], a: 1, city: "Los Angeles", lat: 34.0522, lon: -118.2437 },
    { d: 1, q: "Bollywood, the world's most prolific film industry, is based in which city?", c: ["Delhi", "Chennai", "Mumbai", "Kolkata"], a: 2, city: "Mumbai", lat: 19.076, lon: 72.8777 },
    { d: 1, q: "Which city's Carnival is the world's largest, drawing millions each year?", c: ["Venice", "New Orleans", "Rio de Janeiro", "Tenerife"], a: 2, city: "Rio de Janeiro", lat: -22.9068, lon: -43.1729 },
    { d: 1, q: "Gangnam, made world-famous by a 2012 viral song, is a district of which city?", c: ["Tokyo", "Bangkok", "Seoul", "Taipei"], a: 2, city: "Seoul", lat: 37.5665, lon: 126.978 },
    // medium
    { d: 2, q: "Which city's Comic-Con is the world's most famous pop culture convention?", c: ["New York", "San Diego", "Seattle", "Austin"], a: 1, city: "San Diego", lat: 32.7157, lon: -117.1611 },
    { d: 2, q: "The Cannes Film Festival takes place annually in which country?", c: ["Italy", "France", "Spain", "Monaco"], a: 1, city: "Cannes", lat: 43.5528, lon: 7.0174 },
    { d: 2, q: "Abbey Road Studios, where a famous album cover was shot on a zebra crossing, is in which city?", c: ["Liverpool", "London", "Manchester", "Dublin"], a: 1, city: "London", lat: 51.5074, lon: -0.1278 },
    { d: 2, q: "The video game company Nintendo was founded in 1889 in which city?", c: ["Tokyo", "Kyoto", "Osaka", "Yokohama"], a: 1, city: "Kyoto", lat: 35.0116, lon: 135.7681 },
    // hard
    { d: 3, q: "The Eurovision Song Contest was first held in 1956 in which Swiss city?", c: ["Geneva", "Zurich", "Lugano", "Basel"], a: 2, city: "Lugano", lat: 46.0037, lon: 8.9511 },
    { d: 3, q: "The reality TV format 'Big Brother' was created in which country?", c: ["Germany", "Netherlands", "Sweden", "UK"], a: 1, city: "Amsterdam", lat: 52.3676, lon: 4.9041 },
    { d: 3, q: "The Running of the Bulls, made famous by Hemingway, happens each July in which Spanish city?", c: ["Seville", "Valencia", "Pamplona", "Bilbao"], a: 2, city: "Pamplona", lat: 42.8125, lon: -1.6458 },
    { d: 3, q: "The 1972 Fischer–Spassky 'Match of the Century' chess showdown was held in which city?", c: ["Moscow", "Reykjavík", "Helsinki", "Belgrade"], a: 1, city: "Reykjavík", lat: 64.1466, lon: -21.9426 },
  ],
};
