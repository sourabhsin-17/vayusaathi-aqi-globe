import {
  calculateActivityShiftImpact,
  calculateCommuteShiftImpact,
  calculateRequiredCadr,
} from './impactFormulas';
import type {
  AiAdvisoryPayload,
  AirQualitySnapshot,
  AssistantReply,
  HouseholdProfile,
} from '../types/vayu';

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function generateFallbackAdvisory(
  snapshot: AirQualitySnapshot,
  profile: HouseholdProfile
): AiAdvisoryPayload {
  const hi = profile.language === 'hi';
  const city = snapshot.location.name;
  const isIndiaCity =
    snapshot.location.id.startsWith('in-') ||
    /india/i.test(snapshot.location.state) ||
    snapshot.timezone === 'Asia/Kolkata';

  const costFree = hi ? 'निःशुल्क' : isIndiaCity ? 'Free (₹0)' : 'Free';
  const costPurifierPower = hi
    ? isIndiaCity
      ? 'मौजूदा प्यूरीफायर की बिजली (~₹15–25/दिन)'
      : 'मौजूदा प्यूरीफायर की बिजली'
    : isIndiaCity
    ? 'Existing purifier electricity (~₹15–25/day)'
    : 'Existing purifier electricity (low daily energy)';
  const costSeal = profile.budget === 'free'
    ? costFree
    : isIndiaCity
    ? hi
      ? '₹150–400 (फ़ोम स्ट्रिप)'
      : '₹150–400 (weatherstrip)'
    : hi
    ? 'कम लागत (ड्राफ्ट स्ट्रिप)'
    : 'Low cost (weatherstripping tape)';
  const costMask = isIndiaCity
    ? hi
      ? '₹80–150 प्रति पुन: प्रयोज्य N95 मास्क'
      : '₹80–150 per reusable N95 / Metro fare'
    : hi
    ? 'कम लागत (N95/FFP2 मास्क / ट्रांज़िट किराया)'
    : 'Low cost (reusable N95/FFP2 / transit fare)';

  const pm25 = snapshot.current.pm25;
  const usAqi = snapshot.current.usAqi;
  const cpcbLabel = hi ? snapshot.cpcb.labelHi : snapshot.cpcb.labelEn;
  const cleanWin = `${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}`;
  const worstWin = `${snapshot.worstWindow.startLabel}–${snapshot.worstWindow.endLabel}`;
  const cadr = calculateRequiredCadr(profile.roomSizeSqFt);
  const activityShift = calculateActivityShiftImpact(
    snapshot.worstWindow.avgPm25,
    snapshot.cleanestWindow.avgPm25
  );

  const altTargetMode =
    profile.commuteMode === 'car' || profile.commuteMode === 'two_wheeler'
      ? 'metro'
      : profile.commuteMode === 'bus'
      ? 'metro'
      : 'carpool';
  const commuteImpact = calculateCommuteShiftImpact(
    profile.commuteMode,
    altTargetMode,
    profile.oneWayDistanceKm,
    pm25
  );
  const carpoolImpact = calculateCommuteShiftImpact(
    profile.commuteMode === 'wfh' ? 'car' : profile.commuteMode,
    'carpool',
    profile.oneWayDistanceKm,
    pm25
  );

  const isSevereOrVeryPoor =
    snapshot.cpcb.categoryKey === 'severe' || snapshot.cpcb.categoryKey === 'very_poor';
  const isPoorOrWorse = isSevereOrVeryPoor || snapshot.cpcb.categoryKey === 'poor';

  const hasKids = profile.members.childrenUnder12 || profile.members.schoolAgeKids;
  const hasElderlyOrSensitive =
    profile.members.elderly60Plus || profile.members.respiratoryOrCardiacSensitive;

  const summaryBanner = hi
    ? `${city} में वर्तमान US AQI ${usAqi} (PM2.5 ${pm25} µg/m³, CPCB अनुमानित श्रेणी: ${cpcbLabel}) है। सबसे साफ हवा ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³) और सबसे खराब ${worstWin} (~${snapshot.worstWindow.avgPm25} µg/m³) के बीच रहने का अनुमान है।`
    : `${city} currently records US AQI ${usAqi} (PM2.5 ${pm25} µg/m³, estimated CPCB category: ${cpcbLabel}). Forecast indicates the cleanest window around ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³) and worst dispersion around ${worstWin} (~${snapshot.worstWindow.avgPm25} µg/m³).`;

  // Top 3 actions tailored dynamically to members, purifier, commute, and air level
  const top3Actions = [
    {
      id: 'top-schedule-shift',
      title: hi
        ? hasKids
          ? `बच्चों की बाहरी गतिविधि ${cleanWin} पर शिफ्ट करें`
          : `बाहरी काम व व्यायाम ${cleanWin} पर करें`
        : hasKids
        ? `Shift kids' outdoor play to ${cleanWin} or keep play indoors`
        : `Schedule outdoor errands & walks during ${cleanWin}`,
      why: hi
        ? `${worstWin} के दौरान PM2.5 ~${snapshot.worstWindow.avgPm25} µg/m³ तक पहुंचने का अनुमान है, जबकि ${cleanWin} में यह ~${snapshot.cleanestWindow.avgPm25} µg/m³ रहेगा।`
        : `Forecast PM2.5 peaks near ${snapshot.worstWindow.avgPm25} µg/m³ around ${worstWin} but dips near ${snapshot.cleanestWindow.avgPm25} µg/m³ during ${cleanWin}.`,
      when: isSevereOrVeryPoor
        ? hi
          ? `आज कठोर व्यायाम घर के अंदर रखें; आवश्यक काम केवल ${cleanWin} में करें`
          : `Keep vigorous play indoors today; brief essential outdoor time only at ${cleanWin}`
        : cleanWin,
      whoFor: hasKids
        ? hi
          ? '12 वर्ष से कम के बच्चे, स्कूल जाने वाले बच्चे और पूरा परिवार'
          : 'Children under 12, school-age kids & active adults'
        : hi
        ? 'परिवार के सभी सदस्य'
        : 'All household members',
      effort: hi ? 'कम' : 'Low',
      cost: costFree,
      expectedBenefit: hi
        ? `सबसे खराब समय की तुलना में बाहरी PM2.5 संपर्क में लगभग ${activityShift.reductionPct}% कमी का अनुमान।`
        : `Estimated ~${activityShift.reductionPct}% lower PM2.5 exposure compared to peak hours (estimate).`,
      limitations: hi
        ? 'अनुमान प्रति घंटा मॉडल पूर्वानुमान पर आधारित है; स्थानीय सड़क धुआं अधिक हो सकता है।'
        : 'Based on hourly regional model forecast; localized roadside smoke or construction dust may still spike.',
      formulaSummary: activityShift.formulaDetail,
    },
    profile.hasAirPurifier
      ? {
          id: 'top-purifier-optimize',
          title: hi
            ? `बंद कमरे (${profile.roomSizeSqFt} sq ft) में HEPA प्यूरीफायर चलाएं`
            : `Run HEPA purifier in a sealed ${profile.roomSizeSqFt} sq ft room`,
          why: hi
            ? `बाहरी PM2.5 ${pm25} µg/m³ है। दरवाजे-खिड़कियां बंद रखकर ${cadr.recommendedCadrM3Hr} m³/hr CADR वाला प्यूरीफायर घर के अंदर धुआं घटाता है।`
            : `Outdoor PM2.5 is ${pm25} µg/m³. Closing gaps and running a purifier sized near ${cadr.recommendedCadrM3Hr} m³/hr CADR lowers indoor particle buildup.`,
          when: hi ? `${worstWin} और रात के समय लगातार` : `Continuously during ${worstWin} and overnight sleep`,
          whoFor: hasElderlyOrSensitive
            ? hi
              ? '60+ वरिष्ठ नागरिक व श्वसन-संवेदनशील सदस्य'
              : 'Elderly 60+ and respiratory/cardiac-sensitive members'
            : hi
            ? 'पूरा परिवार (मुख्य शयनकक्ष)'
            : 'Whole household (primary sleeping room)',
          effort: hi ? 'कम' : 'Low',
          cost: costPurifierPower,
          expectedBenefit: hi
            ? 'बंद कमरे में इनडोर PM2.5 में ~45–55% कमी का अनुमान।'
            : 'Estimated ~45–55% lower indoor PM2.5 in the treated room when windows remain sealed.',
          limitations: hi
            ? 'दरवाजे खुले रहने या रसोई के धुएं/अगरबत्ती से लाभ तेजी से घटता है; प्री-फ़िल्टर हर हफ्ते साफ करें।'
            : 'Benefit drops sharply if doors/windows stay open or indoor smoke (incense/frying) is present; clean pre-filter weekly.',
          formulaSummary: cadr.formulaDetail,
        }
      : {
          id: 'top-indoor-seal-mop',
          title: hi
            ? 'खिड़की की दरारें सील करें, गीला पोंछा लगाएं और धुआं बंद करें'
            : 'Seal window gaps, damp mop & stop indoor smoke sources',
          why: hi
            ? `${profile.homeType === 'ground_roadside' ? 'सड़क के पास निचले तल पर' : 'घर के अंदर'} बाहर की धूल व धुआं दरारों से आता है और सूखी झाड़ू से फिर हवा में उड़ता है।`
            : `At ${pm25} µg/m³ ambient PM2.5 (${profile.homeType.replace('_', ' ')}), outdoor haze infiltrates through gaps and dry sweeping resuspends settled dust.`,
          when: hi ? 'सुबह-शाम पोंछा; धुआं/मोमबत्ती व कॉइल पूरी तरह बंद' : 'Damp mop morning/evening; avoid indoor smoke, scented candles & incense',
          whoFor: hi ? 'घर के सभी सदस्य (विशेषकर बच्चे व बुजुर्ग)' : 'Entire household, especially children & seniors',
          effort: hi ? 'कम–मध्यम' : 'Low–Medium',
          cost: costSeal,
          expectedBenefit: hi
            ? 'इनडोर कण जमाव में ~12–20% कमी का अनुमान।'
            : 'Estimated ~12–20% reduction in indoor particle buildup and resuspension.',
          limitations: hi
            ? 'बिना HEPA फ़िल्टर के यह बहुत गंभीर स्मॉग (Severe) में पर्याप्त नहीं होता।'
            : 'Without a HEPA purifier, sealing alone cannot remove very fine PM2.5 during Severe episodes.',
        },
    profile.commuteMode !== 'wfh'
      ? {
          id: 'top-commute-protect',
          title: hi
            ? `${profile.commuteMode === 'two_wheeler' ? 'टू-व्हीलर पर' : 'सफर में'} फिटेड N95/FFP2 पहनें व संभव हो तो मेट्रो/रेल चुनें`
            : profile.commuteMode === 'car'
            ? `Switch ${profile.oneWayDistanceKm} km car commute to Metro/rail or carpool`
            : `Wear a sealed N95/FFP2 during ${formatHour(profile.morningLeaveHour)} commute`,
          why: hi
            ? `आपका सफर ${formatHour(profile.morningLeaveHour)} और ${formatHour(profile.eveningReturnHour)} पर होता है जब सड़क पर PM2.5 अधिक रहता है।`
            : `Your ${formatHour(profile.morningLeaveHour)} / ${formatHour(profile.eveningReturnHour)} commute intersects urban traffic corridors where roadside PM2.5 exceeds background levels.`,
          when: hi
            ? `${formatHour(profile.morningLeaveHour)} और ${formatHour(profile.eveningReturnHour)} के सफर के दौरान`
            : `During ${formatHour(profile.morningLeaveHour)} departure & ${formatHour(profile.eveningReturnHour)} return`,
          whoFor: hi ? 'दैनिक यात्री व बाहर काम करने वाले सदस्य' : 'Commuters and outdoor workers',
          effort: hi ? 'मध्यम' : 'Medium',
          cost: costMask,
          expectedBenefit: hi
            ? `N95 से सड़क PM2.5 में ~80%+ छनन; मेट्रो से कार की तुलना में ${commuteImpact.co2SavedPerTripKg} kg CO2/ट्रिप बचत का अनुमान।`
            : `Fitted N95 filters ~80%+ PM2.5; shifting from car saves ~${commuteImpact.co2SavedPerTripKg} kg CO2e/trip (estimate).`,
          limitations: hi
            ? 'कपड़े या सर्जिकल मास्क PM2.5 से बहुत कम सुरक्षा देते हैं; दाढ़ी या ढीली नाक क्लिप से रिसाव होता है।'
            : 'Cloth and surgical masks offer minimal PM2.5 protection; facial hair or loose nose bridges cause leakage.',
          formulaSummary: commuteImpact.formulaDetail,
        }
      : {
          id: 'top-mask-sensitive',
          title: hi
            ? 'बाहर निकलते समय सही फिटिंग वाला N95/FFP2 मास्क अनिवार्य रखें'
            : 'Use fitted N95/FFP2 masks for any essential outdoor trips',
          why: hi
            ? `वर्तमान US AQI ${usAqi} पर संवेदनशील लोगों के लिए अनफ़िल्टर्ड हवा हानिकारक हो सकती है।`
            : `At US AQI ${usAqi}, short unfiltered errands still expose sensitive airways to high PM2.5 peaks.`,
          when: hi ? `${isPoorOrWorse ? 'पूरे दिन बाहर निकलने पर' : 'भीड़-भाड़ या पीक समय में बाहर जाने पर'}` : 'Whenever stepping outside during Poor–Severe hours',
          whoFor: hasElderlyOrSensitive
            ? hi
              ? 'बुजुर्ग और अस्थमा/हृदय संवेदनशील सदस्य'
              : 'Seniors 60+ & asthma/cardiac-sensitive members'
            : hi
            ? 'बाहर जाने वाले सभी सदस्य'
            : 'All adults stepping outdoors',
          effort: hi ? 'कम' : 'Low',
          cost: costMask,
          expectedBenefit: hi
            ? 'बाहरी सांस में जाने वाले PM2.5 में ~80–90% कमी (सही सील होने पर)।'
            : 'Estimated ~80–90% filtration of inhaled PM2.5 outdoors when sealed tightly.',
          limitations: hi
            ? 'सांस लेने में कठिनाई वाले रोगियों को डॉक्टर की सलाह से N95 चुनना चाहिए।'
            : 'Anyone with severe lung/heart disease experiencing discomfort in a tight respirator should consult a clinician.',
        },
  ];

  const dailyPlanner = [
    {
      period: hi ? 'सुबह (Morning)' : 'Morning',
      timeWindow: '6:00 AM – 9:30 AM',
      headline: isPoorOrWorse
        ? hi
          ? 'सुबह की सैर घर के अंदर रखें और खिड़कियां बंद रखें'
          : 'Move morning walk indoors; keep windows closed'
        : hi
        ? 'हल्की गतिविधि बाहर ठीक है, भारी ट्रैफिक सड़कों से बचें'
        : 'Light outdoor walk acceptable away from busy intersections',
      why: hi
        ? `सुबह ठंडी हवा व कम हवा गति (${snapshot.weather.windSpeedKmh} km/h) जमीन के पास धुआं रोकती है।`
        : `Morning thermal inversion and ${snapshot.weather.windSpeedKmh} km/h wind often trap ground-level PM2.5 near ${pm25} µg/m³.`,
      when: '6:00 AM – 9:30 AM',
      whoFor: hasElderlyOrSensitive
        ? hi
          ? 'विशेषकर 60+ बुजुर्ग और अस्थमा/हृदय रोगी'
          : 'Seniors 60+ & respiratory/cardiac-sensitive members'
        : hi
        ? 'पूरा परिवार'
        : 'All household members',
      effort: hi ? 'कम' : 'Low',
      cost: costFree,
      expectedBenefit: hi ? 'सुबह के पीक प्रदूषण के दौरान गहरी सांस से बचाव।' : 'Avoids elevated morning inhalation during low mixing height.',
      limitations: hi ? 'स्थानीय पार्क में भी सुबह का कोहरा और धुआं हो सकता है।' : 'Neighborhood parks can still accumulate trapped morning haze.',
    },
    {
      period: hi ? 'सफर (Commute)' : 'Commute',
      timeWindow: `${formatHour(profile.morningLeaveHour)} & ${formatHour(profile.eveningReturnHour)}`,
      headline:
        profile.commuteMode === 'wfh'
          ? hi
            ? 'घर से काम जारी रखें; छोटे काम एक ही ट्रिप में जोड़ें'
            : 'Continue WFH; batch local errands into one mid-day trip'
          : hi
          ? `${profile.commuteMode === 'car' ? 'कार में रीसर्क्युलेशन ऑन रखें या मेट्रो चुनें' : 'मेट्रो/बंद बस और N95 मास्क का उपयोग करें'}`
          : profile.commuteMode === 'car'
          ? 'Use AC recirculation mode or switch to Metro/carpool'
          : 'Wear fitted N95/FFP2; prefer Metro/enclosed transit',
      why: hi
        ? `सड़क पर वाहन का धुआं सामान्य AQI से अधिक होता है; दूरी ${profile.oneWayDistanceKm} km है।`
        : `Roadside exhaust concentrations spike above city background across your ${profile.oneWayDistanceKm} km route.`,
      when: `${formatHour(profile.morningLeaveHour)} & ${formatHour(profile.eveningReturnHour)}`,
      whoFor: hi ? 'कामकाजी व स्कूल जाने वाले सदस्य' : 'Commuters & school travelers',
      effort: hi ? 'कम–मध्यम' : 'Low–Medium',
      cost: hi ? 'सामान्य किराया / N95' : 'Transit fare / N95 cost',
      expectedBenefit: hi
        ? `मेट्रो/कारपूल से उत्सर्जन में ~${commuteImpact.co2SavedPerTripKg} kg CO2/ट्रिप तक की बचत।`
        : `Estimated ~${commuteImpact.co2SavedPerTripKg} kg CO2 saved/trip when replacing solo car travel.`,
      limitations: hi ? 'भीड़-भाड़ वाले स्टेशन पैदल हिस्से में N95 मास्क फिर भी जरूरी है।' : 'Last-mile walking segments still require N95 protection.',
    },
    {
      period: hi ? 'दोपहर (Afternoon)' : 'Afternoon',
      timeWindow: cleanWin,
      headline: hi
        ? `सबसे साफ समय (${cleanWin}): 15–20 मिनट वेंटिलेशन व जरूरी बाहरी काम`
        : `Cleanest window (${cleanWin}): brief 15–20 min ventilation & errands`,
      why: hi
        ? `दोपहर की धूप से हवा फैलती है और PM2.5 ~${snapshot.cleanestWindow.avgPm25} µg/m³ तक गिरने का अनुमान है।`
        : `Daytime mixing lowers forecast PM2.5 to ~${snapshot.cleanestWindow.avgPm25} µg/m³ during ${cleanWin}.`,
      when: cleanWin,
      whoFor: hasKids
        ? hi
          ? 'बच्चों के संक्षिप्त आउटडोर समय व घर की हवा बदलने के लिए'
          : 'Brief supervised kids outdoor break & home air exchange'
        : hi
        ? 'पूरा परिवार'
        : 'All household members',
      effort: hi ? 'कम' : 'Low',
      cost: costFree,
      expectedBenefit: hi
        ? `पीक समय की तुलना में ~${activityShift.reductionPct}% कम बाहरी PM2.5 स्तर।`
        : `~${activityShift.reductionPct}% lower ambient PM2.5 than worst forecast window (estimate).`,
      limitations: hi ? 'अगर US AQI > 200 रहे तो खिड़की केवल 10 मिनट खोलें या बंद रखें।' : 'If US AQI stays above 200, keep outdoor time brief and monitor haze visually.',
    },
    {
      period: hi ? 'शाम (Evening)' : 'Evening',
      timeWindow: worstWin,
      headline: hi
        ? `पीक धुंध (${worstWin}): खिड़कियां बंद करें, बाहर व्यायाम न करें`
        : `Peak smog window (${worstWin}): close windows, move activity indoors`,
      why: hi
        ? `शाम को ट्रैफिक, रसोई/हीटिंग धुआं और तापमान गिरावट से PM2.5 ~${snapshot.worstWindow.avgPm25} µg/m³ तक बढ़ता है।`
        : `Evening traffic and cooling boundary layer push forecast PM2.5 toward ~${snapshot.worstWindow.avgPm25} µg/m³.`,
      when: worstWin,
      whoFor: hi ? 'सभी सदस्य, विशेषकर बच्चे व बुजुर्ग' : 'Everyone, especially children & seniors',
      effort: hi ? 'कम' : 'Low',
      cost: costFree,
      expectedBenefit: hi ? 'दिन के सबसे विषैले 2 घंटों से सीधी सुरक्षा।' : 'Avoids peak evening inhalation dose.',
      limitations: hi ? 'रसोई में खाना पकाते समय चिमनी/एग्जॉस्ट चलाना जरूरी है।' : 'Keep kitchen exhaust running while cooking so indoor PM does not accumulate.',
    },
    {
      period: hi ? 'रात (Night)' : 'Night',
      timeWindow: '9:30 PM – 6:00 AM',
      headline: profile.hasAirPurifier
        ? hi
          ? 'शयनकक्ष बंद करके प्यूरीफायर स्लीप/मीडियम मोड पर चलाएं'
          : 'Run bedroom HEPA purifier on steady medium/sleep mode'
        : hi
        ? 'सोने से पहले गीला कपड़ा दरवाजे की निचली दरार पर रखें; अगरबत्ती/कॉइल न जलाएं'
        : 'Block under-door drafts; avoid mosquito coils/incense overnight',
      why: hi
        ? 'हम 7–8 घंटे शयनकक्ष में बिताते हैं; रात में बिना हवा के बाहर का धुआं अंदर जमा रह सकता है।'
        : '7–8 hours of overnight breathing makes bedroom air quality the largest contributor to daily inhaled dose.',
      when: '9:30 PM – 6:00 AM',
      whoFor: hi ? 'पूरा परिवार' : 'Entire household',
      effort: hi ? 'कम' : 'Low',
      cost: profile.hasAirPurifier ? costPurifierPower : costFree,
      expectedBenefit: hi ? 'रात भर स्वच्छ श्वसन वातावरण और बेहतर नींद।' : 'Lowers overnight cumulative exposure during calm winds.',
      limitations: hi ? 'पूरी तरह सील कमरे में सुबह 10 मिनट ताजी हवा (साफ विंडो में) जरूरी है ताकि CO2 न बढ़े।' : 'Crack a window briefly in the cleanest afternoon window to prevent indoor CO2 buildup.',
    },
  ];

  const sustainableAlternatives = [
    {
      id: 'alt-metro-bus',
      title: hi ? 'निजी कार/बाइक के बजाय मेट्रो या इलेक्ट्रिक बस चुनें' : 'Shift commute to Metro or city bus',
      actionSummary: hi
        ? `${profile.oneWayDistanceKm} किमी के सफर के लिए सप्ताह में 3–5 दिन सार्वजनिक परिवहन अपनाएं।`
        : `Replace solo ${profile.commuteMode.replace('_', ' ')} trips over your ${profile.oneWayDistanceKm} km route with Metro or AC bus.`,
      why: hi ? 'कम सड़क उत्सर्जन और मेट्रो के बंद डिब्बों में कम सड़क धूल संपर्क।' : 'Lowers per-passenger tailpipe emissions and shields commuters inside filtered rail coaches.',
      when: hi ? 'कार्यदिवस की सुबह व शाम' : 'Weekday morning & evening commutes',
      whoFor: hi ? 'कामकाजी व कॉलेज जाने वाले सदस्य' : 'Working professionals & students',
      effort: hi ? 'मध्यम' : 'Medium',
      cost: hi ? 'ईंधन/पार्किंग से प्रायः सस्ता' : 'Often lower than fuel + parking',
      exposureChangeText: `${commuteImpact.exposureChangePct <= 0 ? commuteImpact.exposureChangePct : -Math.abs(commuteImpact.exposureChangePct)}% PM2.5 exposure est.`,
      co2SavedText: `${commuteImpact.co2SavedPerTripKg} kg CO2e / trip (${commuteImpact.co2SavedWeeklyKg} kg/wk)`,
      expectedBenefit: hi
        ? `प्रति ट्रिप ${commuteImpact.co2SavedPerTripKg} kg CO2 बचत व कम सड़क धुआं संपर्क।`
        : `Saves ~${commuteImpact.co2SavedPerTripKg} kg CO2e per trip and cuts direct exhaust exposure.`,
      limitations: hi ? 'मेट्रो स्टेशन तक पैदल या ऑटो हिस्से में N95 मास्क जरूरी है।' : 'First/last-mile walking or open auto segments still require N95 protection.',
      formulaTitle: hi ? 'CO2 और संपर्क गणना सूत्र' : 'CO2 & Exposure Formula',
      formulaDetail: commuteImpact.formulaDetail,
    },
    {
      id: 'alt-trip-chain',
      title: hi ? 'अलग-अलग बाहर जाने के बजाय काम एक ट्रिप में जोड़ें' : 'Combine errands into a single trip',
      actionSummary: hi
        ? 'किराना, स्कूल पिकअप और बाजार के काम एक ही रास्ते में निपटाएं।'
        : 'Bundle groceries, pharmacy, and school/office pickups into one chained trip.',
      why: hi ? 'कम ट्रिप से शहर के ट्रैफिक कण और कोल्ड-स्टार्ट इंजन उत्सर्जन घटते हैं।' : 'Avoids extra cold-start vehicle emissions and cuts total time spent near roadside dust.',
      when: hi ? `सबसे साफ समय (${cleanWin}) के आसपास` : `Preferentially around ${cleanWin}`,
      whoFor: hi ? 'पूरा परिवार' : 'Whole household',
      effort: hi ? 'कम' : 'Low',
      cost: costFree,
      exposureChangeText: '-5% daily roadside exposure est.',
      co2SavedText: `${Number((carpoolImpact.co2SavedPerTripKg * 0.6).toFixed(2))} kg CO2e / combined errand`,
      expectedBenefit: hi ? 'कम बाहर निकलने से निजी संपर्क और ईंधन खर्च दोनों घटते हैं।' : 'Reduces personal roadside time and cuts local tailpipe emissions.',
      limitations: hi ? 'ताजा सामान या आपात जरूरतों के लिए हमेशा संभव नहीं।' : 'Not always practical for urgent errands or heavy loads.',
      formulaTitle: hi ? 'ट्रिप-चेनिंग गणना' : 'Trip-Chaining Formula',
      formulaDetail: `Avoiding 1 extra ${Math.max(3, Math.round(profile.oneWayDistanceKm * 0.6))} km local trip eliminates cold-start exhaust and saves ~5% daily roadside inhalation time.`,
    },
    {
      id: 'alt-carpool-walk',
      title:
        snapshot.cpcb.categoryKey === 'good' || snapshot.cpcb.categoryKey === 'satisfactory'
          ? hi
            ? 'साफ हवा के दिनों में 1–2 किमी पैदल चलें'
            : 'Walk short 1–2 km errands on today’s cleaner air'
          : hi
          ? 'सहकर्मियों के साथ कारपूल करें (छोटी पैदल दूरी केवल साफ हवा वाले दिन)'
          : 'Carpool with neighbors/colleagues (save short walks for cleaner days)',
      actionSummary:
        snapshot.cpcb.categoryKey === 'good' || snapshot.cpcb.categoryKey === 'satisfactory'
          ? hi
            ? 'आज हवा संतोषजनक है—छोटी दूरी के लिए वाहन के बजाय पैदल या साइकिल चुनें।'
            : 'Air is Good/Satisfactory today—walk or cycle errands under 2 km instead of taking a vehicle.'
          : hi
          ? `आज PM2.5 ${pm25} µg/m³ है—लंबी पैदल यात्रा टालें और वाहन साझा (कारपूल) करें।`
          : `At ${pm25} µg/m³ PM2.5 today, avoid long roadside walks and share rides via carpool instead.`,
      why: hi ? 'तेज चलने से सांस की दर बढ़ती है; खराब हवा में कारपूल अधिक सुरक्षित और कम उत्सर्जन वाला है।' : 'Brisk walking raises breathing volume; on polluted days carpooling cuts emissions per rider while limiting inhaled dose.',
      when: hi ? 'ऑफिस आने-जाने के समय' : 'Office & school run hours',
      whoFor: hi ? 'कार/बाइक उपयोग करने वाले परिवार' : 'Car & two-wheeler households',
      effort: hi ? 'मध्यम' : 'Medium',
      cost: hi ? 'ईंधन खर्च साझा होने से बचत' : 'Splits fuel cost',
      exposureChangeText: snapshot.cpcb.categoryKey === 'good' || snapshot.cpcb.categoryKey === 'satisfactory' ? '-0% (safe outdoor walk)' : '-25% vs open two-wheeler',
      co2SavedText: `${carpoolImpact.co2SavedPerTripKg} kg CO2e / trip`,
      expectedBenefit: hi ? 'प्रति व्यक्ति उत्सर्जन में 50–60% की कमी।' : 'Cuts per-rider emissions by ~50–60% compared to solo driving.',
      limitations: hi ? 'समान रूट व समय वाले सहयात्रियों का मिलना जरूरी है।' : 'Requires matching schedules with colleagues or neighbors.',
      formulaTitle: hi ? 'कारपूल व पैदल तुलना' : 'Carpool vs Solo Commute Formula',
      formulaDetail: carpoolImpact.formulaDetail,
    },
  ];

  const indoorGuidance = {
    ventilationHeadline: isSevereOrVeryPoor
      ? hi
        ? `खिड़कियां बंद रखें — केवल ${cleanWin} में 10–15 मिनट क्रॉस-वेंटिलेट करें`
        : `Keep windows sealed — brief 10–15 min ventilation only around ${cleanWin}`
      : hi
      ? `${cleanWin} में खिड़कियां खोलें; ${worstWin} में बंद रखें`
      : `Ventilate during ${cleanWin}; close windows before ${worstWin}`,
    ventilationTiming: hi
      ? `सबसे साफ बाहरी समय: ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³)। सबसे खराब समय: ${worstWin} (~${snapshot.worstWindow.avgPm25} µg/m³)।`
      : `Cleanest outdoor window: ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³). Peak smog window: ${worstWin} (~${snapshot.worstWindow.avgPm25} µg/m³).`,
    purifierCadrGuidance: hi
      ? `आपके ${profile.roomSizeSqFt} sq ft (${cadr.roomAreaSqM} m²) कमरे के लिए कम से कम ${cadr.recommendedCadrM3Hr} m³/hr CADR वाला True HEPA (H13) प्यूरीफायर उपयुक्त है।`
      : `For your ${profile.roomSizeSqFt} sq ft (${cadr.roomAreaSqM} m²) room, target a True HEPA (H13) purifier with CADR ≥ ${cadr.recommendedCadrM3Hr} m³/hr (~4.5 air changes/hour).`,
    lowCostHacks: hi
      ? [
          'दरवाजे के नीचे गीला तौलिया या ₹150 की रबर/फ़ोम ड्राफ्ट स्ट्रिप लगाकर बाहर की धूल रोकें।',
          'सूखी झाड़ू की जगह रोज़ गीला पोंछा लगाएं ताकि बैठी हुई धूल दोबारा हवा में न उड़े।',
          'घर के अंदर अगरबत्ती, धूपबत्ती, मोमबत्ती और मच्छर कॉइल पूरी तरह बंद रखें।',
          'खाना पकाते समय ढक्कन लगाएं और एग्जॉस्ट फैन या चिमनी चालू रखें।',
        ]
      : [
          'Seal under-door gaps and loose window frames with foam weatherstripping (or a rolled damp towel at night).',
          'Use wet/damp mopping instead of dry sweeping so settled fine dust is not kicked back into breathing height.',
          'Eliminate indoor combustion: avoid agarbatti (incense), dhoop, scented candles, and mosquito coils.',
          'Cover pots while cooking and run kitchen exhaust fan or crack only the kitchen window.',
        ],
    plantsHonestNote: hi
      ? 'ईमानदार जानकारी: एरेका पाम या स्नेक प्लांट जैसे इनडोर पौधों का PM2.5 घटाने पर नगण्य असर होता है। सुंदरता के लिए रखें, लेकिन इन पर एयर प्यूरीफायर की तरह भरोसा न करें।'
      : 'Honest limit: Indoor plants have very little effect on PM2.5 in real homes. Keep them for comfort, but do not rely on them as an air cleaner.',
    why: hi
      ? `बिना प्यूरीफायर वाले घरों में बाहर का 50–80% PM2.5 दरारों से अंदर आ जाता है, और रसोई/अगरबत्ती से यह और बढ़ जाता है।`
      : `Outdoor PM2.5 (${pm25} µg/m³) infiltrates leaky windows; indoor cooking and incense add extra ultrafine particles.`,
    when: hi ? `दिन भर बंद रखें, केवल ${cleanWin} में संक्षिप्त वेंटिलेशन` : `Keep closed during ${worstWin}; brief exchange at ${cleanWin}`,
    whoFor: hi ? 'घर में रहने वाले सभी सदस्य, विशेषकर बच्चे व बुजुर्ग' : 'All household members indoors',
    effort: hi ? 'कम' : 'Low',
    cost: profile.budget === 'free' ? costFree : costSeal,
    expectedBenefit: hi
      ? 'HEPA प्यूरीफायर से बंद कमरे में ~45–55% और केवल सीलिंग+गीले पोंछे से ~12–20% कमी का अनुमान।'
      : 'Estimated ~45–55% indoor PM2.5 reduction with sized HEPA; ~12–20% with sealing & damp mopping alone.',
    limitations: hi
      ? 'घर के अंदर कोई सेंसर न होने से सटीक इनडोर AQI नहीं मापा जा सकता; यहाँ केवल मार्गदर्शन दिया गया है।'
      : 'No indoor air monitor is connected, so indoor AQI cannot be measured or displayed—guidance is based on outdoor model telemetry.',
    formulaDetail: cadr.formulaDetail,
  };

  const familyProtection: AiAdvisoryPayload['familyProtection'] = [
    {
      groupKey: 'children',
      groupTitle: hi ? 'बच्चे (12 वर्ष से कम व स्कूल)' : 'Children (Under 12 & School-Age)',
      priorityLevel: isPoorOrWorse ? (hi ? 'उच्च प्राथमिकता' : 'High Priority') : (hi ? 'मध्यम' : 'Moderate'),
      guidance: isSevereOrVeryPoor
        ? hi
          ? `आज स्कूल के बाहर खेल व पार्क टालें; केवल ${cleanWin} में हल्का बाहर आना रखें। बच्चों के छोटे साइज का N95/KF94 मास्क उपयोग करें।`
          : `Move outdoor sports/play indoors today; restrict brief outdoor time to ${cleanWin}. Use child-sized fitted N95/KF94 where tolerated.`
        : hi
        ? `खेल का समय ${cleanWin} पर रखें और मुख्य सड़कों से दूर खेलें।`
        : `Schedule outdoor play during ${cleanWin} in parks away from road traffic.`,
      when: hi ? `${cleanWin} (केवल साफ विंडो)` : `Best window: ${cleanWin}`,
      whoFor: hi ? 'बच्चे और किशोर' : 'Children under 12 & school-age kids',
      effort: hi ? 'कम' : 'Low',
      cost: costMask,
      expectedBenefit: hi ? 'बढ़ते फेफड़ों के लिए पीक धुंध के दौरान सांस की खुराक में कमी।' : 'Protects developing lungs by avoiding high-ventilation exercise in peak smog.',
      limitations: hi ? 'बहुत छोटे बच्चों (2 वर्ष से कम) को मास्क नहीं पहनाना चाहिए—उन्हें साफ कमरे में रखें।' : 'Masks are not safe for infants/toddlers under 2; rely on clean indoor air instead.',
    },
    {
      groupKey: 'elderly',
      groupTitle: hi ? 'वरिष्ठ नागरिक (60+)' : 'Elderly (60+)',
      priorityLevel: isPoorOrWorse ? (hi ? 'उच्च प्राथमिकता' : 'High Priority') : (hi ? 'मध्यम' : 'Moderate'),
      guidance: hi
        ? `सुबह की सैर ${worstWin} या सुबह जल्दी के बजाय दोपहर ${cleanWin} या घर के अंदर करें। धूल झाड़ने और ठंडी हवा से बचें।`
        : `Replace early-morning walks with indoor stretching or gentle walking during ${cleanWin}. Keep rescue inhalers/meds handy.`,
      when: hi ? `सुबह-शाम घर के अंदर रहें; दोपहर ${cleanWin} सुरक्षित` : `Stay indoors morning/evening; gentle errands at ${cleanWin}`,
      whoFor: hi ? '60 वर्ष से अधिक उम्र के सदस्य' : 'Adults aged 60+',
      effort: hi ? 'कम' : 'Low',
      cost: costFree,
      expectedBenefit: hi ? 'सुबह के तापमान व्युत्क्रमण व हृदय-श्वसन तनाव से बचाव।' : 'Reduces exposure during morning inversions linked to blood-pressure/airway strain.',
      limitations: hi ? 'लंबे समय तक घर में रहने पर हल्का इनडोर व्यायाम व पानी पीना जारी रखें।' : 'Maintain hydration and gentle indoor mobility when staying indoors.',
    },
    {
      groupKey: 'outdoor_workers',
      groupTitle: hi ? 'बाहर काम करने वाले सदस्य' : 'Outdoor Workers & Field Staff',
      priorityLevel: isPoorOrWorse ? (hi ? 'अति आवश्यक' : 'Critical') : (hi ? 'सामान्य सावधानी' : 'Standard Care'),
      guidance: hi
        ? 'कार्य समय में कसकर फिट होने वाला N95/FFP2 मास्क पहनें, पानी अधिक पिएं और ट्रैफिक सिग्नल/डीजल धुएं से थोड़ी दूरी बनाकर ब्रेक लें।'
        : 'Wear a properly sealed N95/FFP2 respirator with nose clip pressed firm, take breaks away from idling traffic, and rinse face/eyes after shifts.',
      when: hi ? 'बाहरी ड्यूटी के पूरे समय' : 'Throughout outdoor shifts',
      whoFor: hi ? 'फील्ड वर्कर, डिलीवरी, निर्माण/ट्रैफिक कर्मी' : 'Delivery, construction, sales & field workers',
      effort: hi ? 'मध्यम' : 'Medium',
      cost: hi ? '₹80–150/मास्क (पुनः उपयोग योग्य)' : '₹80–150 per reusable N95',
      expectedBenefit: hi ? 'बाहरी काम के दौरान सूक्ष्म कणों में ~80%+ कमी (सही फिट पर)।' : 'Cuts inhaled PM2.5 by ~80%+ outdoors when properly sealed.',
      limitations: hi ? 'नमी में N95 गीला या गंदा होने पर बदलना पड़ता है; सस्ते ढीले मास्क सुरक्षा नहीं देते।' : 'Replace N95 once damp, soiled, or straps loosen; loose masks leak unfiltered air.',
    },
    {
      groupKey: 'sensitive_respiratory',
      groupTitle: hi ? 'अस्थमा, हृदय या फेफड़ों के संवेदनशील सदस्य' : 'Asthma, Heart or Lung Sensitive',
      priorityLevel: isPoorOrWorse ? (hi ? 'उच्चतम सुरक्षा' : 'Highest Priority') : (hi ? 'सतर्क रहें' : 'Watchful'),
      guidance: hi
        ? 'डॉक्टर द्वारा दी गई दवा/इन्हेलर साथ रखें, धुएं या ठंडी हवा से बचें, और खांसी/सांस फूलने पर तुरंत चिकित्सा सलाह लें।'
        : 'Keep prescribed inhalers/medications accessible, minimize outdoor time above US AQI 150, and stay in a sealed/purified room during peak hours.',
      when: hi ? '24 घंटे सतर्कता (विशेषकर पीक विंडो में)' : 'Continuous caution, especially during peak hours',
      whoFor: hi ? 'अस्थमा, COPD, हृदय या एलर्जी संवेदनशील सदस्य' : 'Anyone with asthma, COPD, allergies, or heart conditions',
      effort: hi ? 'कम' : 'Low',
      cost: hi ? '₹0 (सावधानी)' : 'Free (₹0)',
      expectedBenefit: hi ? 'अचानक ट्रिगर और धुंध से होने वाली परेशानी में कमी।' : 'Reduces exposure to sudden PM2.5 triggers.',
      limitations: hi ? 'यह ऐप चिकित्सा निदान नहीं करता—सीने में दर्द या सांस फूलने पर तुरंत डॉक्टर से मिलें।' : 'Not medical advice—seek prompt medical care for chest tightness, wheezing, or shortness of breath.',
    },
  ];

  return {
    summaryBanner,
    top3Actions,
    dailyPlanner,
    sustainableAlternatives,
    indoorGuidance,
    familyProtection,
    maskGuidance: {
      recommendedType: hi ? 'N95 / FFP2 / KN95 (प्रमाणित, बिना वाल्व वाला बेहतर)' : 'Certified N95, FFP2, or KN95 respirator',
      fitGuidance: hi
        ? 'नाक की धातु क्लिप को दबाकर सील करें और दोनों पट्टियां कान/सिर पर कसें ताकि किनारों से हवा लीक न हो।'
        : 'Pinch the metal nose bridge snugly and ensure zero side-cheek gaps so air passes through the filter media, not around edges.',
      clothAndSurgicalLimit: hi
        ? 'चेतावनी: कपड़े के मास्क और ढीले नीले सर्जिकल मास्क PM2.5 जैसे सूक्ष्म धुएं के कणों से बहुत सीमित सुरक्षा देते हैं।'
        : 'Honest limit: Cloth masks and loose surgical masks offer very limited protection against fine PM2.5 smoke particles.',
    },
    medicalDisclaimer: hi
      ? 'सामान्य मार्गदर्शन, चिकित्सीय सलाह नहीं। स्वास्थ्य संबंधी किसी भी निर्णय के लिए योग्य चिकित्सक से परामर्श करें।'
      : 'General guidance, not medical advice. Consult a qualified clinician for respiratory, cardiac, or pediatric health concerns.',
  };
}

export function generateFallbackAssistantReply(
  question: string,
  snapshot: AirQualitySnapshot,
  profile: HouseholdProfile,
  promptGuardTriggered: boolean
): AssistantReply {
  const hi = profile.language === 'hi';
  const qLower = question.toLowerCase();
  const cpcbLabel = hi ? snapshot.cpcb.labelHi : snapshot.cpcb.labelEn;
  const cleanWin = `${snapshot.cleanestWindow.startLabel}–${snapshot.cleanestWindow.endLabel}`;
  const worstWin = `${snapshot.worstWindow.startLabel}–${snapshot.worstWindow.endLabel}`;

  if (promptGuardTriggered) {
    return {
      answer: hi
        ? `मैं केवल लाइव वायु गुणवत्ता डेटा (${snapshot.location.name}: US AQI ${snapshot.current.usAqi}, PM2.5 ${snapshot.current.pm25} µg/m³) और आपके परिवार की सुरक्षा पर आधारित उत्तर दे सकता हूं। कृपया हवा, घर, यात्रा या परिवार की सुरक्षा से जुड़ा सवाल पूछें।`
        : `I can only answer urban air quality, indoor air, commute, and family protection questions grounded in your verified live readings for ${snapshot.location.name} (US AQI ${snapshot.current.usAqi}, PM2.5 ${snapshot.current.pm25} µg/m³).`,
      citedSource: snapshot.sourceName,
      citedTimestamp: snapshot.observationTimestampIso,
      citedUsAqi: snapshot.current.usAqi,
      citedCpcbCategory: cpcbLabel,
      limitations: hi
        ? 'मॉडल-आधारित क्षेत्रीय डेटा; चिकित्सीय सलाह नहीं।'
        : 'Based on regional model telemetry; cannot override safety constraints or invent measurements.',
      generalGuidanceNote: hi ? 'सामान्य मार्गदर्शन, चिकित्सीय सलाह नहीं।' : 'General guidance, not medical advice.',
      mode: 'fallback',
      promptGuardTriggered: true,
    };
  }

  let answer = '';
  if (qLower.includes('play') || qLower.includes('child') || qLower.includes('kid') || qLower.includes('बच्च')) {
    const canPlay = snapshot.cpcb.categoryKey === 'good' || snapshot.cpcb.categoryKey === 'satisfactory';
    answer = hi
      ? canPlay
        ? `${snapshot.location.name} में अभी US AQI ${snapshot.current.usAqi} (${cpcbLabel}) है, इसलिए बच्चे ${cleanWin} में मुख्य सड़क से दूर बाहर खेल सकते हैं।`
        : `${snapshot.location.name} में अभी US AQI ${snapshot.current.usAqi} (PM2.5 ${snapshot.current.pm25} µg/m³, ${cpcbLabel}) है। शाम ${worstWin} के दौरान बाहर खेलना टालें; केवल सबसे साफ समय ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³) में संक्षिप्त समय या घर के अंदर खेलें।`
      : canPlay
      ? `In ${snapshot.location.name}, current US AQI is ${snapshot.current.usAqi} (${cpcbLabel}), so outdoor play is reasonable—prefer ${cleanWin} away from busy roads.`
      : `In ${snapshot.location.name}, current US AQI is ${snapshot.current.usAqi} (PM2.5 ${snapshot.current.pm25} µg/m³, ${cpcbLabel}). Avoid outdoor play during the worst window (${worstWin}, ~${snapshot.worstWindow.avgPm25} µg/m³). If needed, shift a short break to the cleanest forecast window (${cleanWin}, ~${snapshot.cleanestWindow.avgPm25} µg/m³) or keep vigorous play indoors.`;
  } else if (qLower.includes('window') || qLower.includes('ventilat') || qLower.includes('खिड़क')) {
    answer = hi
      ? `अभी खिड़कियां बंद रखें और केवल सबसे साफ समय ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³) में 10–15 मिनट क्रॉस-वेंटिलेशन करें। ${worstWin} के दौरान खिड़कियां पूरी तरह बंद रखें।`
      : `Keep windows closed during elevated hours (${worstWin}, ~${snapshot.worstWindow.avgPm25} µg/m³) and open briefly for 10–15 minutes during the cleanest window (${cleanWin}, ~${snapshot.cleanestWindow.avgPm25} µg/m³).`;
  } else {
    answer = hi
      ? `${snapshot.location.name} में वर्तमान US AQI ${snapshot.current.usAqi} (PM2.5 ${snapshot.current.pm25} µg/m³, ${cpcbLabel}) है। बाहर के काम ${cleanWin} में करें, ${worstWin} में घर के अंदर रहें, और बाहर जाने पर फिटेड N95/FFP2 मास्क पहनें।`
      : `For ${snapshot.location.name} right now, US AQI is ${snapshot.current.usAqi} (PM2.5 ${snapshot.current.pm25} µg/m³, ${cpcbLabel}). Prioritize outdoor errands during ${cleanWin} (~${snapshot.cleanestWindow.avgPm25} µg/m³), stay indoors around ${worstWin}, and wear a well-fitted N95/FFP2 outdoors.`;
  }

  return {
    answer,
    citedSource: snapshot.sourceName,
    citedTimestamp: snapshot.observationTimestampIso,
    citedUsAqi: snapshot.current.usAqi,
    citedCpcbCategory: cpcbLabel,
    limitations: hi
      ? 'बेसिक नियम-आधारित उत्तर: क्षेत्रीय Open-Meteo मॉडल डेटा पर आधारित; घर के अंदर कोई सेंसर नहीं है।'
      : 'Basic rule-based response using regional Open-Meteo model telemetry; localized roadside spikes may be higher.',
    generalGuidanceNote: hi ? 'सामान्य मार्गदर्शन, चिकित्सीय सलाह नहीं।' : 'General guidance, not medical advice.',
    mode: 'fallback',
  };
}
