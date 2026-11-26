import type { HouseholdProfile, IndianLocation } from '../types/vayu';

export const QUICK_PICK_CITIES: IndianLocation[] = [
  { id: 'in-delhi', name: 'Delhi', state: 'Delhi NCR', latitude: 28.6139, longitude: 77.209 },
  { id: 'in-noida', name: 'Noida', state: 'Uttar Pradesh', latitude: 28.5355, longitude: 77.391 },
  { id: 'in-mumbai', name: 'Mumbai', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { id: 'in-kolkata', name: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639 },
  { id: 'in-bengaluru', name: 'Bengaluru', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { id: 'in-hyderabad', name: 'Hyderabad', state: 'Telangana', latitude: 17.385, longitude: 78.4867 },
  { id: 'in-chennai', name: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707 },
  { id: 'in-pune', name: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567 },
  { id: 'in-lucknow', name: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { id: 'in-patna', name: 'Patna', state: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
];

export const GLOBAL_QUICK_PICK_CITIES: IndianLocation[] = [
  { id: 'gl-london', name: 'London', state: 'United Kingdom', latitude: 51.5072, longitude: -0.1276 },
  { id: 'gl-tokyo', name: 'Tokyo', state: 'Kanto, Japan', latitude: 35.6762, longitude: 139.6503 },
  { id: 'gl-new-york', name: 'New York', state: 'New York, USA', latitude: 40.7128, longitude: -74.006 },
  { id: 'gl-paris', name: 'Paris', state: 'Île-de-France, France', latitude: 48.8566, longitude: 2.3522 },
  { id: 'gl-dubai', name: 'Dubai', state: 'United Arab Emirates', latitude: 25.2048, longitude: 55.2708 },
  { id: 'gl-singapore', name: 'Singapore', state: 'Singapore', latitude: 1.3521, longitude: 103.8198 },
  { id: 'gl-sydney', name: 'Sydney', state: 'New South Wales, Australia', latitude: -33.8688, longitude: 151.2093 },
  { id: 'gl-cairo', name: 'Cairo', state: 'Egypt', latitude: 30.0444, longitude: 31.2357 },
];

export const DEFAULT_PROFILE: HouseholdProfile = {
  location: QUICK_PICK_CITIES[0],
  members: {
    childrenUnder12: false,
    schoolAgeKids: false,
    elderly60Plus: false,
    workingProfessionals: true,
    outdoorWorkers: false,
    respiratoryOrCardiacSensitive: false,
  },
  commuteMode: 'metro',
  morningLeaveHour: 9,
  eveningReturnHour: 18,
  oneWayDistanceKm: 10,
  hasAirPurifier: false,
  roomSizeSqFt: 180,
  hasIndoorPlants: false,
  homeType: 'apartment',
  budget: 'low',
  language: 'en',
};

export interface SamplePersona {
  id: string;
  labelEn: string;
  labelHi: string;
  descriptionEn: string;
  descriptionHi: string;
  profile: HouseholdProfile;
}

export const SAMPLE_PERSONAS: SamplePersona[] = [
  {
    id: 'delhi-young-family',
    labelEn: 'Delhi family with 2 young kids',
    labelHi: 'दिल्ली परिवार (2 छोटे बच्चे)',
    descriptionEn: 'Parents + 2 children under 12, daily car commute, apartment, no purifier yet, medium budget.',
    descriptionHi: 'माता-पिता और 12 वर्ष से कम के 2 बच्चे, कार से ऑफिस, अपार्टमेंट, प्यूरीफायर नहीं।',
    profile: {
      location: QUICK_PICK_CITIES[0], // Delhi
      members: {
        childrenUnder12: true,
        schoolAgeKids: true,
        elderly60Plus: false,
        workingProfessionals: true,
        outdoorWorkers: false,
        respiratoryOrCardiacSensitive: false,
      },
      commuteMode: 'car',
      morningLeaveHour: 8,
      eveningReturnHour: 18,
      oneWayDistanceKm: 14,
      hasAirPurifier: false,
      roomSizeSqFt: 200,
      hasIndoorPlants: true,
      homeType: 'apartment',
      budget: 'medium',
      language: 'en',
    },
  },
  {
    id: 'mumbai-daily-commuter',
    labelEn: 'Mumbai daily commuter',
    labelHi: 'मुंबई दैनिक यात्री',
    descriptionEn: 'Working professional with mild asthma, 12 km two-wheeler commute, low budget.',
    descriptionHi: 'नौकरीपेशा व्यक्ति (हल्का अस्थमा), 12 किमी टू-व्हीलर सफर, कम बजट।',
    profile: {
      location: QUICK_PICK_CITIES[2], // Mumbai
      members: {
        childrenUnder12: false,
        schoolAgeKids: false,
        elderly60Plus: false,
        workingProfessionals: true,
        outdoorWorkers: false,
        respiratoryOrCardiacSensitive: true,
      },
      commuteMode: 'two_wheeler',
      morningLeaveHour: 9,
      eveningReturnHour: 19,
      oneWayDistanceKm: 12,
      hasAirPurifier: false,
      roomSizeSqFt: 150,
      hasIndoorPlants: false,
      homeType: 'apartment',
      budget: 'low',
      language: 'en',
    },
  },
  {
    id: 'kolkata-senior-household',
    labelEn: 'Kolkata senior-citizen household',
    labelHi: 'कोलकाता वरिष्ठ नागरिक परिवार',
    descriptionEn: 'Elderly 60+ couple with cardiac/lung sensitivity, ground-floor home, indoor plants, free/low-cost hacks.',
    descriptionHi: '60+ वरिष्ठ दंपत्ति (हृदय/फेफड़ों की संवेदनशीलता), ग्राउंड फ्लोर घर, कम लागत वाले उपाय।',
    profile: {
      location: QUICK_PICK_CITIES[3], // Kolkata
      members: {
        childrenUnder12: false,
        schoolAgeKids: false,
        elderly60Plus: true,
        workingProfessionals: false,
        outdoorWorkers: false,
        respiratoryOrCardiacSensitive: true,
      },
      commuteMode: 'wfh',
      morningLeaveHour: 10,
      eveningReturnHour: 17,
      oneWayDistanceKm: 3,
      hasAirPurifier: false,
      roomSizeSqFt: 160,
      hasIndoorPlants: true,
      homeType: 'ground_roadside',
      budget: 'free',
      language: 'en',
    },
  },
];
