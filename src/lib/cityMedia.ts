import { ALL_MONITORED_CITIES, findCityMeta, type CityPhotoKey } from './aqiCities';
import type { IndianLocation } from '../types/vayu';
import americasSkylineImg from '../assets/images/city_americas_skyline_1795627317657.jpg';
import bengaluruSouthImg from '../assets/images/city_bengaluru_south_1795625023197.jpg';
import chennaiCoastalImg from '../assets/images/city_chennai_coastal_1795625022236.jpg';
import delhiNcrImg from '../assets/images/city_delhi_ncr_1795625019165.jpg';
import eastAsiaTokyoImg from '../assets/images/city_east_asia_tokyo_1795627317169.jpg';
import europeSkylineImg from '../assets/images/city_europe_skyline_1795627317078.jpg';
import jaipurHeartlandImg from '../assets/images/city_jaipur_heartland_1795625021831.jpg';
import kolkataEastImg from '../assets/images/city_kolkata_east_1795625021151.jpg';
import menaWaterfrontImg from '../assets/images/city_mena_waterfront_1795627318105.jpg';
import mumbaiWestImg from '../assets/images/city_mumbai_west_1795625020716.jpg';
import oceaniaHarborImg from '../assets/images/city_oceania_harbor_1795627318207.jpg';

export const CITY_PHOTO_ASSETS: Record<
  CityPhotoKey,
  {
    imageUrl: string;
    fallbackGradient: string;
    altEn: string;
    altHi: string;
  }
> = {
  delhi: {
    imageUrl: delhiNcrImg,
    fallbackGradient: 'from-amber-950 via-stone-900 to-slate-950',
    altEn: 'Kartavya Path and India Gate in New Delhi during winter morning light',
    altHi: 'सर्दियों की सुबह नई दिल्ली में कर्तव्य पथ और इंडिया गेट',
  },
  mumbai: {
    imageUrl: mumbaiWestImg,
    fallbackGradient: 'from-sky-950 via-slate-900 to-amber-950',
    altEn: 'Mumbai Marine Drive crescent bay and coastal skyline at golden hour',
    altHi: 'मुंबई मरीन ड्राइव और अरब सागर तटरेखा',
  },
  kolkata: {
    imageUrl: kolkataEastImg,
    fallbackGradient: 'from-slate-900 via-amber-950 to-slate-950',
    altEn: 'Howrah Bridge spanning the Hooghly River in Kolkata at early dawn',
    altHi: 'कोलकाता में हुगली नदी पर हावड़ा ब्रिज का दृश्य',
  },
  bengaluru: {
    imageUrl: bengaluruSouthImg,
    fallbackGradient: 'from-emerald-950 via-teal-950 to-slate-950',
    altEn: 'Vidhana Soudha framed by lush green canopies of Cubbon Park in Bengaluru',
    altHi: 'बेंगलुरु में कब्बन पार्क के पेड़ों के बीच विधान सौधा',
  },
  jaipur: {
    imageUrl: jaipurHeartlandImg,
    fallbackGradient: 'from-rose-950 via-stone-900 to-slate-950',
    altEn: 'Pink sandstone heritage facades and carved balconies in Jaipur',
    altHi: 'जयपुर की ऐतिहासिक गुलाबी बलुआ पत्थर की इमारतें',
  },
  chennai: {
    imageUrl: chennaiCoastalImg,
    fallbackGradient: 'from-cyan-950 via-slate-900 to-amber-950',
    altEn: 'Chennai Marina Beach coastline and heritage architecture along the Bay of Bengal',
    altHi: 'चेन्नई मरीना बीच और बंगाल की खाड़ी का तटीय दृश्य',
  },
  europe: {
    imageUrl: europeSkylineImg,
    fallbackGradient: 'from-slate-900 via-sky-950 to-stone-950',
    altEn: 'European limestone riverfront bridges and historic boulevards at morning light',
    altHi: 'यूरोपीय नदी तट और ऐतिहासिक स्थापत्य कला',
  },
  east_asia: {
    imageUrl: eastAsiaTokyoImg,
    fallbackGradient: 'from-indigo-950 via-slate-900 to-amber-950',
    altEn: 'East Asian modern bayfront skyline and tree-lined promenade at sunrise',
    altHi: 'पूर्वी एशियाई आधुनिक तटीय शहर और सूर्योदय',
  },
  americas: {
    imageUrl: americasSkylineImg,
    fallbackGradient: 'from-slate-900 via-emerald-950 to-sky-950',
    altEn: 'North American skyline reflected across a serene urban park lake',
    altHi: 'अमेरिकी शहर का क्षितिज और हरित पार्क झील',
  },
  mena: {
    imageUrl: menaWaterfrontImg,
    fallbackGradient: 'from-amber-950 via-cyan-950 to-slate-950',
    altEn: 'Middle Eastern sunlit waterfront promenade and sandstone-and-glass skyline',
    altHi: 'मध्य पूर्व तटीय सैरगाह और शहरी क्षितिज',
  },
  oceania: {
    imageUrl: oceaniaHarborImg,
    fallbackGradient: 'from-sky-950 via-teal-950 to-slate-950',
    altEn: 'Southern Hemisphere coastal harbor with geometric sails, arch bridge, and blue bay',
    altHi: 'दक्षिणी गोलार्ध का तटीय बंदरगाह और नीली खाड़ी',
  },
};

export interface CitySlideItem {
  cityId: string;
  city: IndianLocation;
  title: string;
  state: string;
  region: string;
  stationNetwork: string;
  landmarkEn: string;
  landmarkHi: string;
  imageUrl: string;
  fallbackGradient: string;
  altEn: string;
  altHi: string;
}

const SLIDE_CITY_IDS = [
  'in-delhi',
  'in-mumbai',
  'gl-tokyo',
  'gl-london',
  'gl-new-york',
  'in-kolkata',
  'in-bengaluru',
  'gl-dubai',
  'gl-paris',
  'in-jaipur',
  'gl-sydney',
  'in-chennai',
];

export const FEATURED_CITY_SLIDES: CitySlideItem[] = SLIDE_CITY_IDS.map((id) => {
  const meta = ALL_MONITORED_CITIES.find((c) => c.id === id)!;
  const media = CITY_PHOTO_ASSETS[meta.photoKey];
  return {
    cityId: meta.id,
    city: {
      id: meta.id,
      name: meta.name,
      state: meta.state,
      latitude: meta.latitude,
      longitude: meta.longitude,
    },
    title: meta.name,
    state: meta.state,
    region: meta.region,
    stationNetwork: meta.stationNetwork,
    landmarkEn: meta.landmarkEn,
    landmarkHi: meta.landmarkHi,
    imageUrl: media.imageUrl,
    fallbackGradient: media.fallbackGradient,
    altEn: media.altEn,
    altHi: media.altHi,
  };
});

export function getLocationVisualAsset(location: IndianLocation): {
  imageUrl: string;
  fallbackGradient: string;
  altEn: string;
  altHi: string;
  stationNetwork: string;
  landmarkEn: string;
  landmarkHi: string;
} {
  const meta = findCityMeta(location);
  if (meta) {
    const asset = CITY_PHOTO_ASSETS[meta.photoKey];
    return {
      ...asset,
      stationNetwork: meta.stationNetwork,
      landmarkEn: meta.landmarkEn,
      landmarkHi: meta.landmarkHi,
    };
  }

  // Intelligent worldwide regional fallback based on coordinates
  const { latitude: lat, longitude: lng } = location;
  let key: CityPhotoKey = 'delhi';

  if (lng < -30) {
    key = lat < -20 && lng > -50 ? 'oceania' : 'americas';
  } else if (lat > 35 && lng >= -15 && lng <= 45) {
    key = 'europe';
  } else if (lng > 20 && lng < 65 && lat >= -35 && lat <= 38) {
    key = lat < 0 ? 'bengaluru' : 'mena';
  } else if (lng > 98) {
    key = lat < -10 ? 'oceania' : 'east_asia';
  } else if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 97) {
    // Inside India bounds
    if (lat < 15.5) {
      key = lng > 79 ? 'chennai' : 'bengaluru';
    } else if (lng < 75.5 && lat < 22) {
      key = 'mumbai';
    } else if (lng > 84) {
      key = 'kolkata';
    } else if (lat < 27.5) {
      key = 'jaipur';
    } else {
      key = 'delhi';
    }
  } else {
    key = 'europe';
  }

  const asset = CITY_PHOTO_ASSETS[key];
  return {
    ...asset,
    stationNetwork: 'Open-Meteo Global CAMS/ECMWF Grid',
    landmarkEn: location.state || 'Global Airshed Point',
    landmarkHi: location.state || 'वैश्विक वायु क्षेत्र',
  };
}
