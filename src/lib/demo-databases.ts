import { DemoTemplateInfo } from '../types';

export interface DemoDatabaseDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  popularQuestions: string[];
  schemaSql: string;
  seedSql: string;
}

export const DEMO_TEMPLATES_METADATA: DemoTemplateInfo[] = [
  {
    id: 'retail-sales',
    name: 'Retail & Sales Analytics',
    category: 'Commerce & Retail',
    description: 'Omnichannel retail performance with products, customers, transactions, and categories across store networks.',
    tables: ['sales', 'products', 'customers'],
    estimatedRows: '~170 records',
    popularQuestions: [
      'What is our total revenue by product category?',
      'Who are the top 5 highest-spending customers?',
      'Show monthly revenue trends for the current year.',
      'Which product has the highest sales volume?'
    ]
  }
];

// SQL Schema and Seed Generator for Retail & Sales Analytics
export function getDemoDatabaseDefinition(_templateId?: string): DemoDatabaseDefinition {
  return {
    id: 'retail-sales',
    name: 'Retail & Sales Analytics',
    category: 'Commerce & Retail',
    description: 'Omnichannel retail performance with products, customers, transactions, and categories.',
    popularQuestions: DEMO_TEMPLATES_METADATA[0].popularQuestions,
    schemaSql: `
      CREATE TABLE customers (
        customer_id INTEGER PRIMARY KEY,
        customer_name TEXT NOT NULL,
        email TEXT UNIQUE,
        city TEXT,
        loyalty_tier TEXT,
        join_date DATE
      );

      CREATE TABLE products (
        product_id INTEGER PRIMARY KEY,
        product_name TEXT NOT NULL,
        category TEXT NOT NULL,
        cost_price REAL NOT NULL,
        unit_price REAL NOT NULL,
        stock_quantity INTEGER
      );

      CREATE TABLE sales (
        sale_id INTEGER PRIMARY KEY,
        product_id INTEGER,
        customer_id INTEGER,
        category TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        revenue REAL NOT NULL,
        sale_date DATE NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(product_id),
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
      );
    `,
    seedSql: generateRetailSeedSql()
  };
}

// Seed Data Generator for Retail & Sales Analytics
function generateRetailSeedSql(): string {
  const cities = ['New York', 'San Francisco', 'Chicago', 'Austin', 'Seattle', 'Boston', 'Denver', 'Miami'];
  const firstNames = ['James', 'Emma', 'Liam', 'Olivia', 'Noah', 'Sophia', 'Ethan', 'Ava', 'Mason', 'Isabella', 'Lucas', 'Mia', 'Alexander', 'Charlotte', 'Benjamin', 'Amelia'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson', 'Martinez', 'Anderson', 'Taylor', 'Thomas'];

  const customerInserts: string[] = [];
  for (let i = 1; i <= 30; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const name = `${fn} ${ln}`;
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;
    const city = cities[i % cities.length];
    const tier = i % 5 === 0 ? 'Platinum' : i % 3 === 0 ? 'Gold' : 'Silver';
    const joinDate = `2024-0${(i % 9) + 1}-15`;
    customerInserts.push(`INSERT INTO customers VALUES (${i}, '${name}', '${email}', '${city}', '${tier}', '${joinDate}');`);
  }

  const products = [
    [1, 'Pro Wireless Earbuds', 'Electronics', 45.0, 129.99, 120],
    [2, 'UltraHD 4K Smart Monitor', 'Electronics', 180.0, 399.99, 45],
    [3, 'Mechanical Gaming Keyboard', 'Electronics', 55.0, 119.50, 85],
    [4, 'Noise-Cancelling Headphones', 'Electronics', 110.0, 249.00, 60],
    [5, 'Smart Fitness Tracker', 'Electronics', 35.0, 89.95, 140],
    [6, 'Espresso Machine Deluxo', 'Home & Kitchen', 120.0, 299.00, 35],
    [7, 'Cast Iron Dutch Oven 6Qt', 'Home & Kitchen', 30.0, 79.99, 90],
    [8, 'Robotic Vacuum Cleaner', 'Home & Kitchen', 140.0, 349.99, 40],
    [9, 'Stainless Steel Knife Set', 'Home & Kitchen', 40.0, 99.50, 75],
    [10, 'Thermal Air Fryer XL', 'Home & Kitchen', 45.0, 119.99, 65],
    [11, 'Waterproof Trail Jacket', 'Apparel', 35.0, 110.00, 110],
    [12, 'Merino Wool Thermal Sweater', 'Apparel', 28.0, 85.00, 95],
    [13, 'Performance Running Shoes', 'Apparel', 42.0, 135.00, 80],
    [14, 'Breathable Yoga Leggings', 'Apparel', 18.0, 58.00, 150],
    [15, 'Hydrating Vitamin C Serum', 'Cosmetics', 12.0, 42.00, 200],
    [16, 'Mineral Daily Sunscreen SPF50', 'Cosmetics', 9.0, 28.50, 250],
    [17, 'Botanical Night Repair Oil', 'Cosmetics', 16.0, 56.00, 130],
    [18, 'Ultralight 2-Person Tent', 'Sports & Outdoors', 95.0, 220.00, 30],
    [19, 'Insulated Hydro Flask 32oz', 'Sports & Outdoors', 12.0, 38.00, 180],
    [20, 'Carbon Fiber Trekking Poles', 'Sports & Outdoors', 24.0, 69.95, 90]
  ];

  const productInserts = products.map(
    p => `INSERT INTO products VALUES (${p[0]}, '${p[1]}', '${p[2]}', ${p[3]}, ${p[4]}, ${p[5]});`
  );

  const salesInserts: string[] = [];
  const dates = [
    '2024-01-08', '2024-01-19', '2024-01-27', '2024-02-04', '2024-02-14', '2024-02-22',
    '2024-03-05', '2024-03-17', '2024-03-29', '2024-04-03', '2024-04-18', '2024-04-26',
    '2024-05-02', '2024-05-15', '2024-05-28', '2024-06-11', '2024-06-23', '2024-07-04',
    '2024-07-19', '2024-08-08', '2024-08-25', '2024-09-02', '2024-09-18', '2024-10-05',
    '2024-10-22', '2024-11-12', '2024-11-28', '2024-12-05', '2024-12-18', '2024-12-29'
  ];

  for (let s = 1; s <= 120; s++) {
    const prod = products[(s * 7) % products.length];
    const prodId = prod[0];
    const cat = prod[2];
    const unitPrice = prod[4] as number;
    const custId = (s % 30) + 1;
    const qty = ((s % 4) + 1);
    const rev = Number((qty * unitPrice).toFixed(2));
    const dt = dates[s % dates.length];
    salesInserts.push(
      `INSERT INTO sales VALUES (${s}, ${prodId}, ${custId}, '${cat}', ${qty}, ${unitPrice}, ${rev}, '${dt}');`
    );
  }

  return [...customerInserts, ...productInserts, ...salesInserts].join('\n');
}
