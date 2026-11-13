import { SampleDataset } from '../types';

function generateEnterpriseTelemetryBatch(count = 6000): Record<string, any>[] {
  const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD'];
  const desks = ['London-FX', 'NewYork-Rates', 'Tokyo-Spot', 'Frankfurt-Clearing'];
  const venues = ['EBS', 'Reuters', 'Currenex', 'FXall'];
  const rows: Record<string, any>[] = [];

  const baseDate = new Date('2025-01-01T00:00:00Z').getTime();

  for (let i = 0; i < count; i++) {
    const dayOffset = Math.floor(i / 25);
    const dt = new Date(baseDate + dayOffset * 86400000);
    const isoDate = dt.toISOString().slice(0, 10);
    const pair = pairs[i % pairs.length];
    const baseRate =
      pair === 'USD/JPY'
        ? 148.5
        : pair === 'GBP/USD'
        ? 1.27
        : pair === 'EUR/USD'
        ? 1.09
        : pair === 'USD/CHF'
        ? 0.88
        : 0.66;

    const jitter = ((Math.sin(i * 0.37) + Math.cos(i * 0.13)) * 0.008) * baseRate;
    const rate = Number((baseRate + jitter).toFixed(4));
    const volumeLots = 10 + ((i * 7) % 240);
    const latencyMs = Number((4.2 + ((i * 13) % 18) * 0.4).toFixed(2));

    rows.push({
      trade_id: `FX-${100000 + i}`,
      trade_date: isoDate,
      currency_pair: pair,
      exchange_rate: rate,
      volume_lots: volumeLots,
      latency_ms: latencyMs,
      desk: desks[i % desks.length],
      venue: venues[i % venues.length],
    });
  }

  return rows;
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'ecommerce_orders',
    name: 'E-Commerce Orders & Revenue',
    description: 'Order records containing transaction dates, item prices, quantities, and status.',
    category: 'E-Commerce',
    rowCount: 50,
    csvContent: `order_id,order_date,customer_name,category,quantity,unit_price,shipping_country,fulfillment_status
ORD-1001,2024-01-15,Alice Smith,Electronics,2,299.99,USA,Delivered
ORD-1002,2024-01-16,Bob Johnson,Apparel,1,49.50,Canada,Shipped
ORD-1003,2024-01-17,Charlie Brown,Home & Kitchen,4,18.99,USA,Delivered
ORD-1004,2024-01-18,Diana Prince,Books,3,12.50,UK,Processing
ORD-1005,2024-01-19,Edward Davis,Sports,1,120.00,Germany,Delivered
ORD-1006,2024-01-20,Fiona Gallagher,Electronics,1,899.00,USA,Shipped
ORD-1007,2024-01-21,George Clark,Apparel,2,35.00,France,Delivered
ORD-1008,2024-01-22,Hannah Abbott,Home & Kitchen,1,150.25,Canada,Cancelled
ORD-1009,2024-01-23,Ian Malcolm,Books,5,9.99,USA,Delivered
ORD-1010,2024-01-24,Julia Roberts,Sports,2,75.00,Japan,Shipped
ORD-1011,2024-01-25,Kevin Spacey,Electronics,1,1299.99,USA,Delivered
ORD-1012,2024-01-26,Laura Croft,Apparel,3,28.00,UK,Processing
ORD-1013,2024-01-27,Michael Scott,Home & Kitchen,2,45.00,USA,Delivered
ORD-1014,2024-01-28,Nina Nina,Books,1,19.99,Germany,Shipped
ORD-1015,2024-01-29,Oscar Martinez,Sports,1,210.00,Canada,Delivered
ORD-1016,2024-01-30,Pam Beesly,Electronics,2,149.00,USA,Delivered
ORD-1017,2024-01-31,Quinn Fabray,Apparel,4,15.00,France,Cancelled
ORD-1018,2024-02-01,Ryan Howard,Home & Kitchen,1,89.90,USA,Processing
ORD-1019,2024-02-02,Stanley Hudson,Books,2,14.50,Japan,Shipped
ORD-1020,2024-02-03,Toby Flenderson,Sports,1,65.00,UK,Delivered
ORD-1021,2024-02-04,Ursula Buffay,Electronics,1,450.00,USA,Delivered
ORD-1022,2024-02-05,Victor Vance,Apparel,2,62.00,Germany,Shipped
ORD-1023,2024-02-06,Wendy Testaburger,Home & Kitchen,3,24.99,Canada,Delivered
ORD-1024,2024-02-07,Xavier Woods,Books,1,29.99,USA,Delivered
ORD-1025,2024-02-08,Yolanda Adams,Sports,2,95.00,France,Processing
ORD-1026,2024-02-09,Zack Morris,Electronics,1,349.00,USA,Delivered
ORD-1027,2024-02-10,Aaron Paul,Apparel,5,22.00,UK,Shipped
ORD-1028,2024-02-11,Beth Smith,Home & Kitchen,1,199.00,Japan,Delivered
ORD-1029,2024-02-12,Carl Sagan,Books,2,11.50,USA,Cancelled
ORD-1030,2024-02-13,Donna Noble,Sports,1,180.00,Germany,Delivered
ORD-1031,2024-02-14,Eric Foreman,Electronics,2,79.99,Canada,Shipped
ORD-1032,2024-02-15,Frank Castle,Apparel,1,110.00,USA,Delivered
ORD-1033,2024-02-16,Grace Hopper,Home & Kitchen,2,55.00,UK,Processing
ORD-1034,2024-02-17,Hank Hill,Books,3,8.99,USA,Delivered
ORD-1035,2024-02-18,Iris West,Sports,1,250.00,France,Delivered
ORD-1036,2024-02-19,Jim Halpert,Electronics,1,199.00,USA,Shipped
ORD-1037,2024-02-20,Kate Bishop,Apparel,2,42.50,Germany,Delivered
ORD-1038,2024-02-21,Leo Fitz,Home & Kitchen,1,135.00,Canada,Processing
ORD-1039,2024-02-22,Maya Lin,Books,4,16.00,Japan,Delivered
ORD-1040,2024-02-23,Nick Miller,Sports,2,88.00,USA,Shipped
ORD-1041,2024-02-24,Olivia Dunham,Electronics,1,699.00,UK,Delivered
ORD-1042,2024-02-25,Peter Parker,Apparel,3,19.99,USA,Delivered
ORD-1043,2024-02-26,Quentin Coldwater,Home & Kitchen,1,78.50,France,Cancelled
ORD-1044,2024-02-27,Rachel Green,Books,2,24.00,Canada,Shipped
ORD-1045,2024-02-28,Steve Rogers,Sports,1,145.00,USA,Delivered
ORD-1046,2024-02-29,Tony Stark,Electronics,1,2499.00,USA,Delivered
ORD-1047,2024-03-01,Uma Thurman,Apparel,2,58.00,Germany,Processing
ORD-1048,2024-03-02,Valerie Frizzle,Home & Kitchen,1,92.00,UK,Delivered
ORD-1049,2024-03-03,Wanda Maximoff,Books,3,15.50,USA,Shipped
ORD-1050,2024-03-04,Yuri Gagarin,Sports,1,310.00,Japan,Delivered`
  },
  {
    id: 'patient_records',
    name: 'Patient Hospital Logs',
    description: 'Clinical observation data including age, blood pressure, glucose, and medical department.',
    category: 'Healthcare',
    rowCount: 40,
    csvContent: `patient_id,visit_date,age,systolic_bp,blood_sugar,department,status
PAT-201,2024-01-10,45,120,95,Cardiology,Outpatient
PAT-202,2024-01-11,62,142,118,Neurology,Inpatient
PAT-203,2024-01-12,28,115,88,Orthopedics,Outpatient
PAT-204,2024-01-13,71,150,140,Cardiology,Inpatient
PAT-205,2024-01-14,35,118,92,Pediatrics,Discharged
PAT-206,2024-01-15,54,138,105,Oncology,Inpatient
PAT-207,2024-01-16,49,124,98,Cardiology,Outpatient
PAT-208,2024-01-17,33,110,85,Orthopedics,Discharged
PAT-209,2024-01-18,68,148,132,Neurology,Inpatient
PAT-210,2024-01-19,52,126,102,Cardiology,Outpatient
PAT-211,2024-01-20,41,122,94,Oncology,Outpatient
PAT-212,2024-01-21,59,136,110,Orthopedics,Inpatient
PAT-213,2024-01-22,31,114,89,Pediatrics,Discharged
PAT-214,2024-01-23,76,155,145,Cardiology,Inpatient
PAT-215,2024-01-24,47,128,100,Neurology,Outpatient
PAT-216,2024-01-25,60,140,115,Oncology,Inpatient
PAT-217,2024-01-26,25,108,82,Orthopedics,Discharged
PAT-218,2024-01-27,50,130,104,Cardiology,Outpatient
PAT-219,2024-01-28,64,144,122,Neurology,Inpatient
PAT-220,2024-01-29,38,116,90,Pediatrics,Discharged
PAT-221,2024-01-30,43,121,96,Cardiology,Outpatient
PAT-222,2024-01-31,57,135,108,Oncology,Outpatient
PAT-223,2024-02-01,69,152,138,Neurology,Inpatient
PAT-224,2024-02-02,30,112,86,Orthopedics,Discharged
PAT-225,2024-02-03,55,134,106,Cardiology,Inpatient
PAT-226,2024-02-04,48,125,99,Pediatrics,Outpatient
PAT-227,2024-02-05,66,146,128,Oncology,Inpatient
PAT-228,2024-02-06,29,110,84,Orthopedics,Discharged
PAT-229,2024-02-07,51,127,101,Neurology,Outpatient
PAT-230,2024-02-08,73,158,150,Cardiology,Inpatient
PAT-231,2024-02-09,36,117,91,Pediatrics,Discharged
PAT-232,2024-02-10,58,137,112,Oncology,Inpatient
PAT-233,2024-02-11,44,123,97,Cardiology,Outpatient
PAT-234,2024-02-12,61,141,119,Neurology,Inpatient
PAT-235,2024-02-13,27,109,83,Orthopedics,Discharged
PAT-236,2024-02-14,53,129,103,Cardiology,Outpatient
PAT-237,2024-02-15,67,149,134,Oncology,Inpatient
PAT-238,2024-02-16,34,115,88,Pediatrics,Discharged
PAT-239,2024-02-17,46,126,101,Neurology,Outpatient
PAT-240,2024-02-18,70,154,142,Cardiology,Inpatient`
  },
  {
    id: 'saas_metrics',
    name: 'SaaS Subscription Metrics',
    description: 'User engagement, tier plans, monthly spend, and geographic region.',
    category: 'SaaS / Tech',
    rowCount: 35,
    csvContent: `user_id,signup_date,subscription_tier,monthly_spend,active_days,region
USR-801,2024-01-01,Enterprise,1200.00,28,North America
USR-802,2024-01-02,Starter,49.00,12,Europe
USR-803,2024-01-03,Professional,199.00,22,Asia Pacific
USR-804,2024-01-04,Free,0.00,5,Latin America
USR-805,2024-01-05,Starter,49.00,14,North America
USR-806,2024-01-06,Enterprise,2500.00,30,North America
USR-807,2024-01-07,Professional,199.00,19,Europe
USR-808,2024-01-08,Free,0.00,3,Asia Pacific
USR-809,2024-01-09,Starter,49.00,10,Latin America
USR-810,2024-01-10,Enterprise,1800.00,26,Europe
USR-811,2024-01-11,Professional,199.00,21,North America
USR-812,2024-01-12,Free,0.00,8,North America
USR-813,2024-01-13,Starter,49.00,15,Asia Pacific
USR-814,2024-01-14,Enterprise,3200.00,29,North America
USR-815,2024-01-15,Professional,199.00,18,Europe
USR-816,2024-01-16,Free,0.00,2,Latin America
USR-817,2024-01-17,Starter,49.00,11,North America
USR-818,2024-01-18,Enterprise,1500.00,25,Asia Pacific
USR-819,2024-01-19,Professional,199.00,20,Europe
USR-820,2024-01-20,Free,0.00,6,North America
USR-821,2024-01-21,Starter,49.00,13,Latin America
USR-822,2024-01-22,Enterprise,2100.00,27,North America
USR-823,2024-01-23,Professional,199.00,17,Asia Pacific
USR-824,2024-01-24,Free,0.00,4,Europe
USR-825,2024-01-25,Starter,49.00,9,North America
USR-826,2024-01-26,Enterprise,2900.00,30,Europe
USR-827,2024-01-27,Professional,199.00,23,North America
USR-828,2024-01-28,Free,0.00,1,Asia Pacific
USR-829,2024-01-29,Starter,49.00,16,Latin America
USR-830,2024-01-30,Enterprise,1600.00,24,North America
USR-831,2024-01-31,Professional,199.00,19,Europe
USR-832,2024-02-01,Free,0.00,7,North America
USR-833,2024-02-02,Starter,49.00,12,Asia Pacific
USR-834,2024-02-03,Enterprise,2200.00,28,North America
USR-835,2024-02-04,Professional,199.00,21,Europe`
  },
  {
    id: 'enterprise_6k_telemetry',
    name: 'FX & Clearing Feed (6,000 Rows)',
    description: 'High-volume institutional FX clearing ticks engineered to benchmark >5,000-row hybrid server routing.',
    category: 'Enterprise Benchmark',
    rowCount: 6000,
    generator: () => generateEnterpriseTelemetryBatch(6000),
  },
];
