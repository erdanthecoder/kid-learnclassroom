/* Vaultline — the world's currencies, so any of them can be found by searching
 * rather than scrolled past.
 *
 * `rate` is what one unit was worth in US dollars at the time this list was
 * written. They are starting points, not live data — the Rates screen exists so
 * you can correct any of them, and the app never fetches a rate on its own.
 */
export const CATALOGUE = [
  // --- widely held ---
  { code: 'USD', name: 'US dollar', rate: 1 },
  { code: 'EUR', name: 'Euro', rate: 1.09 },
  { code: 'GBP', name: 'British pound', rate: 1.27 },
  { code: 'JPY', name: 'Japanese yen', rate: 0.0064 },
  { code: 'CHF', name: 'Swiss franc', rate: 1.13 },
  { code: 'CAD', name: 'Canadian dollar', rate: 0.73 },
  { code: 'AUD', name: 'Australian dollar', rate: 0.66 },
  { code: 'NZD', name: 'New Zealand dollar', rate: 0.61 },
  { code: 'CNY', name: 'Chinese yuan', rate: 0.14 },
  { code: 'HKD', name: 'Hong Kong dollar', rate: 0.128 },
  { code: 'SGD', name: 'Singapore dollar', rate: 0.74 },

  // --- Europe ---
  { code: 'SEK', name: 'Swedish krona', rate: 0.095 },
  { code: 'NOK', name: 'Norwegian krone', rate: 0.093 },
  { code: 'DKK', name: 'Danish krone', rate: 0.146 },
  { code: 'ISK', name: 'Icelandic krona', rate: 0.0072 },
  { code: 'PLN', name: 'Polish zloty', rate: 0.25 },
  { code: 'CZK', name: 'Czech koruna', rate: 0.043 },
  { code: 'HUF', name: 'Hungarian forint', rate: 0.0027 },
  { code: 'RON', name: 'Romanian leu', rate: 0.22 },
  { code: 'BGN', name: 'Bulgarian lev', rate: 0.557 },
  { code: 'RSD', name: 'Serbian dinar', rate: 0.0093 },
  { code: 'MKD', name: 'Macedonian denar', rate: 0.0177 },
  { code: 'BAM', name: 'Bosnia-Herzegovina mark', rate: 0.557 },
  { code: 'ALL', name: 'Albanian lek', rate: 0.0107 },
  { code: 'MDL', name: 'Moldovan leu', rate: 0.056 },
  { code: 'UAH', name: 'Ukrainian hryvnia', rate: 0.024 },
  { code: 'BYN', name: 'Belarusian ruble', rate: 0.31 },
  { code: 'RUB', name: 'Russian ruble', rate: 0.011 },
  { code: 'TRY', name: 'Turkish lira', rate: 0.029 },
  { code: 'GIP', name: 'Gibraltar pound', rate: 1.27 },

  // --- Central Asia and the Caucasus ---
  { code: 'KGS', name: 'Kyrgyz som', rate: 0.0114 },
  { code: 'KZT', name: 'Kazakh tenge', rate: 0.0021 },
  { code: 'UZS', name: 'Uzbek som', rate: 0.000079 },
  { code: 'TJS', name: 'Tajik somoni', rate: 0.092 },
  { code: 'TMT', name: 'Turkmen manat', rate: 0.286 },
  { code: 'AZN', name: 'Azerbaijani manat', rate: 0.588 },
  { code: 'GEL', name: 'Georgian lari', rate: 0.37 },
  { code: 'AMD', name: 'Armenian dram', rate: 0.0026 },
  { code: 'MNT', name: 'Mongolian tugrik', rate: 0.00029 },
  { code: 'AFN', name: 'Afghan afghani', rate: 0.014 },

  // --- Middle East ---
  { code: 'AED', name: 'UAE dirham', rate: 0.272 },
  { code: 'SAR', name: 'Saudi riyal', rate: 0.267 },
  { code: 'QAR', name: 'Qatari riyal', rate: 0.275 },
  { code: 'KWD', name: 'Kuwaiti dinar', rate: 3.26 },
  { code: 'BHD', name: 'Bahraini dinar', rate: 2.65 },
  { code: 'OMR', name: 'Omani rial', rate: 2.60 },
  { code: 'JOD', name: 'Jordanian dinar', rate: 1.41 },
  { code: 'ILS', name: 'Israeli shekel', rate: 0.27 },
  { code: 'LBP', name: 'Lebanese pound', rate: 0.0000112 },
  { code: 'IQD', name: 'Iraqi dinar', rate: 0.00076 },
  { code: 'IRR', name: 'Iranian rial', rate: 0.0000238 },
  { code: 'YER', name: 'Yemeni rial', rate: 0.004 },
  { code: 'SYP', name: 'Syrian pound', rate: 0.00008 },

  // --- South and South-East Asia ---
  { code: 'INR', name: 'Indian rupee', rate: 0.012 },
  { code: 'PKR', name: 'Pakistani rupee', rate: 0.0036 },
  { code: 'BDT', name: 'Bangladeshi taka', rate: 0.0084 },
  { code: 'LKR', name: 'Sri Lankan rupee', rate: 0.0034 },
  { code: 'NPR', name: 'Nepalese rupee', rate: 0.0075 },
  { code: 'BTN', name: 'Bhutanese ngultrum', rate: 0.012 },
  { code: 'MVR', name: 'Maldivian rufiyaa', rate: 0.065 },
  { code: 'THB', name: 'Thai baht', rate: 0.029 },
  { code: 'VND', name: 'Vietnamese dong', rate: 0.0000393 },
  { code: 'IDR', name: 'Indonesian rupiah', rate: 0.0000617 },
  { code: 'MYR', name: 'Malaysian ringgit', rate: 0.023 },
  { code: 'PHP', name: 'Philippine peso', rate: 0.017 },
  { code: 'MMK', name: 'Myanmar kyat', rate: 0.00048 },
  { code: 'KHR', name: 'Cambodian riel', rate: 0.00025 },
  { code: 'LAK', name: 'Lao kip', rate: 0.000046 },
  { code: 'BND', name: 'Brunei dollar', rate: 0.74 },
  { code: 'KRW', name: 'South Korean won', rate: 0.00072 },
  { code: 'TWD', name: 'New Taiwan dollar', rate: 0.031 },
  { code: 'MOP', name: 'Macanese pataca', rate: 0.124 },

  // --- Africa ---
  { code: 'ZAR', name: 'South African rand', rate: 0.055 },
  { code: 'EGP', name: 'Egyptian pound', rate: 0.0205 },
  { code: 'NGN', name: 'Nigerian naira', rate: 0.00063 },
  { code: 'KES', name: 'Kenyan shilling', rate: 0.0077 },
  { code: 'GHS', name: 'Ghanaian cedi', rate: 0.064 },
  { code: 'MAD', name: 'Moroccan dirham', rate: 0.10 },
  { code: 'TND', name: 'Tunisian dinar', rate: 0.32 },
  { code: 'DZD', name: 'Algerian dinar', rate: 0.0074 },
  { code: 'LYD', name: 'Libyan dinar', rate: 0.205 },
  { code: 'ETB', name: 'Ethiopian birr', rate: 0.0079 },
  { code: 'UGX', name: 'Ugandan shilling', rate: 0.00027 },
  { code: 'TZS', name: 'Tanzanian shilling', rate: 0.00037 },
  { code: 'RWF', name: 'Rwandan franc', rate: 0.00073 },
  { code: 'ZMW', name: 'Zambian kwacha', rate: 0.037 },
  { code: 'BWP', name: 'Botswana pula', rate: 0.073 },
  { code: 'MUR', name: 'Mauritian rupee', rate: 0.021 },
  { code: 'NAD', name: 'Namibian dollar', rate: 0.055 },
  { code: 'XOF', name: 'West African CFA franc', rate: 0.00166 },
  { code: 'XAF', name: 'Central African CFA franc', rate: 0.00166 },
  { code: 'CDF', name: 'Congolese franc', rate: 0.00035 },
  { code: 'AOA', name: 'Angolan kwanza', rate: 0.0011 },
  { code: 'MZN', name: 'Mozambican metical', rate: 0.0157 },
  { code: 'MWK', name: 'Malawian kwacha', rate: 0.00058 },
  { code: 'SDG', name: 'Sudanese pound', rate: 0.00166 },
  { code: 'SOS', name: 'Somali shilling', rate: 0.00175 },
  { code: 'SSP', name: 'South Sudanese pound', rate: 0.00023 },
  { code: 'GMD', name: 'Gambian dalasi', rate: 0.0143 },
  { code: 'GNF', name: 'Guinean franc', rate: 0.000116 },
  { code: 'SLE', name: 'Sierra Leonean leone', rate: 0.044 },
  { code: 'LRD', name: 'Liberian dollar', rate: 0.0052 },
  { code: 'CVE', name: 'Cape Verdean escudo', rate: 0.0099 },
  { code: 'DJF', name: 'Djiboutian franc', rate: 0.0056 },
  { code: 'ERN', name: 'Eritrean nakfa', rate: 0.0667 },
  { code: 'SCR', name: 'Seychellois rupee', rate: 0.070 },
  { code: 'SZL', name: 'Swazi lilangeni', rate: 0.055 },
  { code: 'LSL', name: 'Lesotho loti', rate: 0.055 },
  { code: 'BIF', name: 'Burundian franc', rate: 0.00034 },
  { code: 'KMF', name: 'Comorian franc', rate: 0.00223 },
  { code: 'MGA', name: 'Malagasy ariary', rate: 0.00022 },
  { code: 'STN', name: 'Sao Tome and Principe dobra', rate: 0.044 },
  { code: 'MRU', name: 'Mauritanian ouguiya', rate: 0.025 },

  // --- Americas ---
  { code: 'MXN', name: 'Mexican peso', rate: 0.050 },
  { code: 'BRL', name: 'Brazilian real', rate: 0.18 },
  { code: 'ARS', name: 'Argentine peso', rate: 0.001 },
  { code: 'CLP', name: 'Chilean peso', rate: 0.00105 },
  { code: 'COP', name: 'Colombian peso', rate: 0.00024 },
  { code: 'PEN', name: 'Peruvian sol', rate: 0.27 },
  { code: 'UYU', name: 'Uruguayan peso', rate: 0.024 },
  { code: 'PYG', name: 'Paraguayan guarani', rate: 0.00013 },
  { code: 'BOB', name: 'Bolivian boliviano', rate: 0.145 },
  { code: 'VES', name: 'Venezuelan bolivar', rate: 0.027 },
  { code: 'GTQ', name: 'Guatemalan quetzal', rate: 0.129 },
  { code: 'HNL', name: 'Honduran lempira', rate: 0.040 },
  { code: 'NIO', name: 'Nicaraguan cordoba', rate: 0.027 },
  { code: 'CRC', name: 'Costa Rican colon', rate: 0.0019 },
  { code: 'PAB', name: 'Panamanian balboa', rate: 1 },
  { code: 'DOP', name: 'Dominican peso', rate: 0.0167 },
  { code: 'CUP', name: 'Cuban peso', rate: 0.0417 },
  { code: 'JMD', name: 'Jamaican dollar', rate: 0.0064 },
  { code: 'TTD', name: 'Trinidad and Tobago dollar', rate: 0.147 },
  { code: 'BBD', name: 'Barbadian dollar', rate: 0.5 },
  { code: 'BSD', name: 'Bahamian dollar', rate: 1 },
  { code: 'BZD', name: 'Belize dollar', rate: 0.5 },
  { code: 'XCD', name: 'East Caribbean dollar', rate: 0.37 },
  { code: 'HTG', name: 'Haitian gourde', rate: 0.0076 },
  { code: 'GYD', name: 'Guyanese dollar', rate: 0.0048 },
  { code: 'SRD', name: 'Surinamese dollar', rate: 0.028 },
  { code: 'AWG', name: 'Aruban florin', rate: 0.558 },
  { code: 'ANG', name: 'Netherlands Antillean guilder', rate: 0.558 },
  { code: 'KYD', name: 'Cayman Islands dollar', rate: 1.2 },
  { code: 'BMD', name: 'Bermudian dollar', rate: 1 },

  // --- Pacific and remote territories ---
  { code: 'FJD', name: 'Fijian dollar', rate: 0.44 },
  { code: 'PGK', name: 'Papua New Guinean kina', rate: 0.26 },
  { code: 'SBD', name: 'Solomon Islands dollar', rate: 0.118 },
  { code: 'VUV', name: 'Vanuatu vatu', rate: 0.0084 },
  { code: 'WST', name: 'Samoan tala', rate: 0.36 },
  { code: 'TOP', name: 'Tongan paanga', rate: 0.42 },
  { code: 'XPF', name: 'CFP franc', rate: 0.00913 },
  { code: 'FKP', name: 'Falkland Islands pound', rate: 1.27 },
  { code: 'SHP', name: 'Saint Helena pound', rate: 1.27 }
];

const byCode = new Map(CATALOGUE.map((c) => [c.code, c]));

export function lookup(code) {
  return byCode.get(String(code).toUpperCase()) || null;
}

/* Matches on code or name. Codes that start with the query come first, then
   names that start with it, then anything containing it — so typing "no" puts
   NOK above the currencies that merely have "no" in the middle of a word. */
export function search(query, limit = 8) {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];

  const scored = [];
  for (const c of CATALOGUE) {
    const code = c.code.toLowerCase();
    const name = c.name.toLowerCase();
    let score = -1;
    if (code === q) score = 0;
    else if (code.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (code.includes(q)) score = 4;
    if (score >= 0) scored.push({ currency: c, score });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.currency.code.localeCompare(b.currency.code))
    .slice(0, limit)
    .map((s) => s.currency);
}
