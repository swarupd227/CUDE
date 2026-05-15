-- AdventureWorks DW — Sample Data for Demo
USE adventureworks;

-- ═══════════════════════════════════════════════════════════════
-- DimSalesTerritory
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimSalesTerritory (SalesTerritoryKey, SalesTerritoryRegion, SalesTerritoryCountry, SalesTerritoryGroup) VALUES
(1, 'Northwest', 'United States', 'North America'),
(2, 'Northeast', 'United States', 'North America'),
(3, 'Central', 'United States', 'North America'),
(4, 'Southwest', 'United States', 'North America'),
(5, 'Southeast', 'United States', 'North America'),
(6, 'Canada', 'Canada', 'North America'),
(7, 'France', 'France', 'Europe'),
(8, 'Germany', 'Germany', 'Europe'),
(9, 'Australia', 'Australia', 'Pacific'),
(10, 'United Kingdom', 'United Kingdom', 'Europe');

-- ═══════════════════════════════════════════════════════════════
-- DimGeography
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimGeography (GeographyKey, City, StateProvinceCode, StateProvinceName, CountryRegionCode, EnglishCountryRegionName, PostalCode, SalesTerritoryKey) VALUES
(1, 'Redmond', 'WA', 'Washington', 'US', 'United States', '98052', 1),
(2, 'Seattle', 'WA', 'Washington', 'US', 'United States', '98101', 1),
(3, 'New York', 'NY', 'New York', 'US', 'United States', '10001', 2),
(4, 'Boston', 'MA', 'Massachusetts', 'US', 'United States', '02101', 2),
(5, 'Chicago', 'IL', 'Illinois', 'US', 'United States', '60601', 3),
(6, 'Dallas', 'TX', 'Texas', 'US', 'United States', '75201', 4),
(7, 'Phoenix', 'AZ', 'Arizona', 'US', 'United States', '85001', 4),
(8, 'Atlanta', 'GA', 'Georgia', 'US', 'United States', '30301', 5),
(9, 'Toronto', 'ON', 'Ontario', 'CA', 'Canada', 'M5H', 6),
(10, 'Vancouver', 'BC', 'British Columbia', 'CA', 'Canada', 'V6B', 6),
(11, 'Paris', NULL, 'Ile-de-France', 'FR', 'France', '75001', 7),
(12, 'Berlin', NULL, 'Berlin', 'DE', 'Germany', '10115', 8),
(13, 'Sydney', 'NSW', 'New South Wales', 'AU', 'Australia', '2000', 9),
(14, 'London', NULL, 'England', 'GB', 'United Kingdom', 'SW1A', 10),
(15, 'Melbourne', 'VIC', 'Victoria', 'AU', 'Australia', '3000', 9);

-- ═══════════════════════════════════════════════════════════════
-- DimProductCategory
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimProductCategory (ProductCategoryKey, EnglishProductCategoryName) VALUES
(1, 'Bikes'), (2, 'Components'), (3, 'Clothing'), (4, 'Accessories');

-- ═══════════════════════════════════════════════════════════════
-- DimProductSubcategory
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimProductSubcategory (ProductSubcategoryKey, EnglishProductSubcategoryName, ProductCategoryKey) VALUES
(1, 'Mountain Bikes', 1), (2, 'Road Bikes', 1), (3, 'Touring Bikes', 1),
(4, 'Handlebars', 2), (5, 'Bottom Brackets', 2), (6, 'Brakes', 2), (7, 'Chains', 2), (8, 'Wheels', 2),
(9, 'Jerseys', 3), (10, 'Shorts', 3), (11, 'Caps', 3), (12, 'Gloves', 3), (13, 'Socks', 3),
(14, 'Helmets', 4), (15, 'Tires and Tubes', 4), (16, 'Bottles and Cages', 4), (17, 'Lights', 4);

-- ═══════════════════════════════════════════════════════════════
-- DimProduct (30 products)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimProduct (ProductKey, EnglishProductName, StandardCost, ListPrice, Color, Size, Weight, ProductLine, Class, Style, ProductSubcategoryKey, StartDate, Status) VALUES
(1, 'Mountain-100 Black, 38', 1898.09, 3374.99, 'Black', '38', 9.23, 'M', 'H', 'U', 1, '2019-01-01', 'Current'),
(2, 'Mountain-100 Black, 42', 1898.09, 3374.99, 'Black', '42', 9.56, 'M', 'H', 'U', 1, '2019-01-01', 'Current'),
(3, 'Mountain-100 Silver, 38', 1912.15, 3399.99, 'Silver', '38', 9.23, 'M', 'H', 'U', 1, '2019-01-01', 'Current'),
(4, 'Mountain-200 Black, 38', 1251.98, 2294.99, 'Black', '38', 11.13, 'M', 'H', 'U', 1, '2019-01-01', 'Current'),
(5, 'Mountain-200 Silver, 38', 1265.62, 2319.99, 'Silver', '38', 11.13, 'M', 'H', 'U', 1, '2019-01-01', 'Current'),
(6, 'Road-150 Red, 44', 2171.29, 3578.27, 'Red', '44', 6.89, 'R', 'H', 'U', 2, '2019-01-01', 'Current'),
(7, 'Road-150 Red, 48', 2171.29, 3578.27, 'Red', '48', 7.13, 'R', 'H', 'U', 2, '2019-01-01', 'Current'),
(8, 'Road-250 Black, 44', 1518.72, 2443.35, 'Black', '44', 8.12, 'R', 'H', 'U', 2, '2019-01-01', 'Current'),
(9, 'Road-250 Red, 48', 1518.72, 2443.35, 'Red', '48', 8.45, 'R', 'H', 'U', 2, '2019-01-01', 'Current'),
(10, 'Touring-1000 Blue, 46', 2171.29, 2384.07, 'Blue', '46', 11.56, 'T', 'H', 'U', 3, '2019-01-01', 'Current'),
(11, 'Touring-1000 Yellow, 50', 2171.29, 2384.07, 'Yellow', '50', 12.01, 'T', 'H', 'U', 3, '2019-01-01', 'Current'),
(12, 'HL Mountain Handlebars', 40.62, 120.27, 'Silver', NULL, NULL, 'M', NULL, NULL, 4, '2019-01-01', 'Current'),
(13, 'HL Road Handlebars', 40.62, 120.27, 'Silver', NULL, NULL, 'R', NULL, NULL, 4, '2019-01-01', 'Current'),
(14, 'LL Bottom Bracket', 23.98, 53.99, 'Silver', NULL, NULL, NULL, 'L', NULL, 5, '2019-01-01', 'Current'),
(15, 'ML Bottom Bracket', 44.95, 101.24, 'Silver', NULL, NULL, NULL, 'M', NULL, 5, '2019-01-01', 'Current'),
(16, 'Front Brakes', 47.29, 106.50, 'Silver', NULL, NULL, NULL, NULL, NULL, 6, '2019-01-01', 'Current'),
(17, 'Rear Brakes', 47.29, 106.50, 'Silver', NULL, NULL, NULL, NULL, NULL, 6, '2019-01-01', 'Current'),
(18, 'Chain', 8.99, 20.24, 'Silver', NULL, NULL, NULL, NULL, NULL, 7, '2019-01-01', 'Current'),
(19, 'HL Mountain Front Wheel', 133.29, 300.22, 'Black', NULL, NULL, 'M', 'H', NULL, 8, '2019-01-01', 'Current'),
(20, 'Sport-100 Helmet, Red', 13.09, 34.99, 'Red', NULL, NULL, 'S', NULL, NULL, 14, '2019-01-01', 'Current'),
(21, 'Sport-100 Helmet, Blue', 13.09, 34.99, 'Blue', NULL, NULL, 'S', NULL, NULL, 14, '2019-01-01', 'Current'),
(22, 'Long-Sleeve Logo Jersey, M', 38.49, 49.99, 'Multi', 'M', NULL, 'S', NULL, NULL, 9, '2019-01-01', 'Current'),
(23, 'Long-Sleeve Logo Jersey, L', 38.49, 49.99, 'Multi', 'L', NULL, 'S', NULL, NULL, 9, '2019-01-01', 'Current'),
(24, 'Mountain Bike Socks, M', 3.40, 9.50, 'White', 'M', NULL, 'S', NULL, NULL, 13, '2019-01-01', 'Current'),
(25, 'Mountain Bike Socks, L', 3.40, 9.50, 'White', 'L', NULL, 'S', NULL, NULL, 13, '2019-01-01', 'Current'),
(26, 'AWC Logo Cap', 6.92, 8.99, 'Multi', NULL, NULL, 'S', NULL, NULL, 11, '2019-01-01', 'Current'),
(27, 'Full-Finger Gloves, M', 15.62, 37.99, 'Black', 'M', NULL, 'S', NULL, NULL, 12, '2019-01-01', 'Current'),
(28, 'Full-Finger Gloves, L', 15.62, 37.99, 'Black', 'L', NULL, 'S', NULL, NULL, 12, '2019-01-01', 'Current'),
(29, 'Water Bottle - 30 oz.', 4.99, 4.99, NULL, NULL, NULL, 'S', NULL, NULL, 16, '2019-01-01', 'Current'),
(30, 'Taillight', 10.32, 29.99, NULL, NULL, NULL, 'S', NULL, NULL, 17, '2019-01-01', 'Current');

-- ═══════════════════════════════════════════════════════════════
-- DimDate (2019-2024)
-- ═══════════════════════════════════════════════════════════════
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS populate_dates()
BEGIN
  DECLARE d DATE DEFAULT '2019-01-01';
  WHILE d <= '2024-12-31' DO
    INSERT IGNORE INTO DimDate VALUES (
      YEAR(d)*10000 + MONTH(d)*100 + DAY(d),
      d, DAYOFWEEK(d), DAYNAME(d), MONTH(d), MONTHNAME(d),
      QUARTER(d), YEAR(d), IF(MONTH(d)<=6,1,2),
      QUARTER(d), YEAR(d)
    );
    SET d = DATE_ADD(d, INTERVAL 1 DAY);
  END WHILE;
END//
DELIMITER ;
CALL populate_dates();
DROP PROCEDURE IF EXISTS populate_dates;

-- ═══════════════════════════════════════════════════════════════
-- DimCustomer (50 customers)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimCustomer (CustomerKey, FirstName, LastName, EmailAddress, Gender, MaritalStatus, YearlyIncome, TotalChildren, EnglishEducation, EnglishOccupation, HouseOwnerFlag, NumberCarsOwned, DateFirstPurchase, GeographyKey) VALUES
(1,'Jon','Yang','jon.yang@adventure-works.com','M','M',90000,2,'Bachelors','Professional',1,0,'2019-01-01',1),
(2,'Eugene','Huang','eugene.huang@adventure-works.com','M','S',60000,3,'Bachelors','Professional',0,1,'2019-02-15',2),
(3,'Ruben','Torres','ruben.torres@adventure-works.com','M','M',60000,3,'Bachelors','Professional',1,1,'2019-03-01',3),
(4,'Christy','Zhu','christy.zhu@adventure-works.com','F','S',70000,0,'Bachelors','Professional',0,1,'2019-01-15',4),
(5,'Elizabeth','Johnson','elizabeth.johnson@adventure-works.com','F','S',80000,5,'Bachelors','Professional',1,1,'2019-04-01',5),
(6,'Julio','Ruiz','julio.ruiz@adventure-works.com','M','S',50000,0,'Bachelors','Clerical',0,0,'2019-02-01',6),
(7,'Janet','Alvarez','janet.alvarez@adventure-works.com','F','M',70000,2,'Bachelors','Professional',1,2,'2019-05-01',7),
(8,'Marco','Mehta','marco.mehta@adventure-works.com','M','M',120000,0,'Graduate Degree','Management',1,2,'2019-06-01',8),
(9,'Rob','Verhoff','rob.verhoff@adventure-works.com','M','S',75000,1,'Bachelors','Professional',0,1,'2019-03-15',9),
(10,'Shannon','Carlson','shannon.carlson@adventure-works.com','F','M',95000,2,'Graduate Degree','Management',1,3,'2019-07-01',10),
(11,'Jacquelyn','Suarez','jacquelyn.suarez@adventure-works.com','F','S',55000,0,'Bachelors','Skilled Manual',0,1,'2019-08-01',11),
(12,'Curtis','Lu','curtis.lu@adventure-works.com','M','M',85000,1,'Bachelors','Professional',1,0,'2019-09-01',12),
(13,'Lauren','Walker','lauren.walker@adventure-works.com','F','M',100000,3,'Graduate Degree','Management',1,2,'2019-10-01',13),
(14,'Ian','Jenkins','ian.jenkins@adventure-works.com','M','S',40000,0,'High School','Clerical',0,0,'2019-11-01',14),
(15,'Sydney','Bennett','sydney.bennett@adventure-works.com','F','S',65000,1,'Bachelors','Professional',0,1,'2019-12-01',15),
(16,'Chloe','Young','chloe.young@adventure-works.com','F','M',110000,2,'Graduate Degree','Management',1,2,'2020-01-01',1),
(17,'Wyatt','Hill','wyatt.hill@adventure-works.com','M','S',45000,0,'Bachelors','Skilled Manual',0,1,'2020-02-01',2),
(18,'Katie','Jordan','katie.jordan@adventure-works.com','F','M',78000,1,'Bachelors','Professional',1,1,'2020-03-01',3),
(19,'Devin','Knight','devin.knight@adventure-works.com','M','S',92000,0,'Graduate Degree','Professional',1,2,'2020-04-01',5),
(20,'Megan','Wood','megan.wood@adventure-works.com','F','M',68000,2,'Bachelors','Professional',0,1,'2020-05-01',6),
(21,'Michael','Scott','michael.scott@adventure-works.com','M','M',75000,2,'Bachelors','Management',1,1,'2020-06-01',7),
(22,'Angela','Martin','angela.martin@adventure-works.com','F','S',62000,1,'Bachelors','Clerical',0,0,'2020-07-01',8),
(23,'Jim','Halpert','jim.halpert@adventure-works.com','M','M',82000,3,'Bachelors','Professional',1,2,'2020-08-01',9),
(24,'Pam','Beesly','pam.beesly@adventure-works.com','F','M',55000,2,'Bachelors','Clerical',1,1,'2020-09-01',10),
(25,'Dwight','Schrute','dwight.schrute@adventure-works.com','M','S',70000,0,'High School','Skilled Manual',1,1,'2020-10-01',11),
(26,'Ryan','Howard','ryan.howard@adventure-works.com','M','S',42000,0,'Bachelors','Clerical',0,0,'2020-11-01',12),
(27,'Kelly','Kapoor','kelly.kapoor@adventure-works.com','F','S',48000,0,'Bachelors','Clerical',0,1,'2020-12-01',13),
(28,'Oscar','Martinez','oscar.martinez@adventure-works.com','M','S',72000,0,'Graduate Degree','Professional',1,1,'2021-01-01',14),
(29,'Stanley','Hudson','stanley.hudson@adventure-works.com','M','M',88000,2,'Bachelors','Professional',1,2,'2021-02-01',15),
(30,'Kevin','Malone','kevin.malone@adventure-works.com','M','S',52000,0,'High School','Clerical',0,0,'2021-03-01',1),
(31,'Phyllis','Vance','phyllis.vance@adventure-works.com','F','M',66000,1,'Bachelors','Skilled Manual',1,1,'2021-04-01',2),
(32,'Toby','Flenderson','toby.flenderson@adventure-works.com','M','S',58000,1,'Graduate Degree','Professional',0,1,'2021-05-01',4),
(33,'Darryl','Philbin','darryl.philbin@adventure-works.com','M','S',56000,1,'High School','Skilled Manual',0,1,'2021-06-01',5),
(34,'Erin','Hannon','erin.hannon@adventure-works.com','F','S',38000,0,'High School','Clerical',0,0,'2021-07-01',6),
(35,'Andy','Bernard','andy.bernard@adventure-works.com','M','S',72000,0,'Graduate Degree','Professional',0,2,'2021-08-01',7),
(36,'Meredith','Palmer','meredith.palmer@adventure-works.com','F','S',46000,1,'High School','Clerical',0,1,'2021-09-01',8),
(37,'Creed','Bratton','creed.bratton@adventure-works.com','M','S',35000,0,'High School','Clerical',0,0,'2021-10-01',9),
(38,'Clark','Green','clark.green@adventure-works.com','M','S',44000,0,'Bachelors','Clerical',0,1,'2021-11-01',10),
(39,'Pete','Miller','pete.miller@adventure-works.com','M','S',48000,0,'Bachelors','Clerical',0,0,'2021-12-01',11),
(40,'Nelly','Bertram','nelly.bertram@adventure-works.com','F','S',64000,0,'Graduate Degree','Management',0,1,'2022-01-01',14),
(41,'David','Wallace','david.wallace@adventure-works.com','M','M',150000,3,'Graduate Degree','Management',1,3,'2022-02-01',1),
(42,'Jan','Levinson','jan.levinson@adventure-works.com','F','S',130000,1,'Graduate Degree','Management',1,2,'2022-03-01',2),
(43,'Karen','Filippelli','karen.filippelli@adventure-works.com','F','S',78000,0,'Bachelors','Professional',0,1,'2022-04-01',3),
(44,'Holly','Flax','holly.flax@adventure-works.com','F','M',72000,0,'Graduate Degree','Professional',1,1,'2022-05-01',5),
(45,'Robert','California','robert.california@adventure-works.com','M','M',200000,2,'Graduate Degree','Management',1,4,'2022-06-01',13),
(46,'Gabe','Lewis','gabe.lewis@adventure-works.com','M','S',55000,0,'Bachelors','Professional',0,0,'2022-07-01',14),
(47,'Jo','Bennett','jo.bennett@adventure-works.com','F','S',180000,0,'Graduate Degree','Management',1,3,'2022-08-01',4),
(48,'Charles','Miner','charles.miner@adventure-works.com','M','M',120000,1,'Graduate Degree','Management',1,2,'2022-09-01',8),
(49,'Todd','Packer','todd.packer@adventure-works.com','M','S',65000,0,'High School','Professional',0,1,'2022-10-01',6),
(50,'Val','Johnson','val.johnson@adventure-works.com','F','S',42000,0,'High School','Skilled Manual',0,0,'2022-11-01',12);

-- ═══════════════════════════════════════════════════════════════
-- DimEmployee (10 employees)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimEmployee (EmployeeKey, FirstName, LastName, Title, HireDate, BirthDate, EmailAddress, DepartmentName, BaseRate, VacationHours, SickLeaveHours, SalesPersonFlag) VALUES
(1,'Stephen','Jiang','North American Sales Manager','2017-01-01','1975-03-15','stephen.jiang@adventure-works.com','Sales',48.10,99,69,1),
(2,'Michael','Blythe','Sales Representative','2017-06-01','1981-07-20','michael.blythe@adventure-works.com','Sales',23.10,18,29,1),
(3,'Linda','Mitchell','Sales Representative','2017-09-01','1979-02-01','linda.mitchell@adventure-works.com','Sales',23.10,20,30,1),
(4,'Jillian','Carson','Sales Representative','2018-01-01','1983-11-10','jillian.carson@adventure-works.com','Sales',23.10,22,33,1),
(5,'Garrett','Vargas','Sales Representative','2018-06-01','1985-04-22','garrett.vargas@adventure-works.com','Sales',23.10,15,25,1),
(6,'Tsvi','Reiter','Sales Representative','2018-09-01','1980-08-18','tsvi.reiter@adventure-works.com','Sales',23.10,16,27,1),
(7,'Pamela','Ansman-Wolfe','Sales Representative','2019-01-01','1982-06-05','pamela.ansman@adventure-works.com','Sales',23.10,14,24,1),
(8,'Shu','Ito','Sales Representative','2019-06-01','1984-01-30','shu.ito@adventure-works.com','Sales',23.10,12,22,1),
(9,'Jose','Saraiva','Sales Representative','2019-09-01','1986-09-12','jose.saraiva@adventure-works.com','Sales',23.10,10,20,1),
(10,'David','Campbell','Sales Representative','2020-01-01','1987-12-25','david.campbell@adventure-works.com','Sales',23.10,8,18,1);

-- ═══════════════════════════════════════════════════════════════
-- DimReseller (15 resellers)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO DimReseller (ResellerKey, ResellerName, BusinessType, NumberEmployees, AnnualSales, AnnualRevenue, YearOpened, GeographyKey) VALUES
(1,'Premier Sport, Inc.','Value Added Reseller',25,5000000,5200000,2005,1),
(2,'Cycles Wholesaler','Warehouse',50,12000000,12500000,2001,2),
(3,'International Bikes','Specialty Bike Shop',15,3500000,3800000,2010,3),
(4,'West Side Mart','Warehouse',80,25000000,26000000,1998,4),
(5,'Metropolitan Bicycles','Specialty Bike Shop',12,2800000,3000000,2012,5),
(6,'Trail Blazer Bikes','Specialty Bike Shop',8,1500000,1700000,2015,6),
(7,'European Cycles','Value Added Reseller',35,8000000,8500000,2003,11),
(8,'German Bike Pros','Specialty Bike Shop',20,4200000,4500000,2008,12),
(9,'Sydney Cycle Sports','Value Added Reseller',18,3900000,4100000,2009,13),
(10,'London Bike Exchange','Warehouse',45,9500000,10000000,2004,14),
(11,'Fitness Equipment Corp','Warehouse',60,15000000,15800000,2002,7),
(12,'Mountain High Sports','Specialty Bike Shop',10,2100000,2300000,2014,8),
(13,'Pacific Bike Rentals','Specialty Bike Shop',6,900000,1000000,2018,15),
(14,'National Bike Traders','Value Added Reseller',30,7000000,7400000,2006,9),
(15,'Continental Sales','Warehouse',70,18000000,19000000,2000,10);

-- ═══════════════════════════════════════════════════════════════
-- FactInternetSales (~500 rows of realistic sales data)
-- ═══════════════════════════════════════════════════════════════
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS populate_internet_sales()
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE order_num INT DEFAULT 43659;
  DECLARE line_num INT;
  DECLARE order_date_key INT;
  DECLARE cust_key INT;
  DECLARE prod_key INT;
  DECLARE terr_key INT;
  DECLARE qty INT;
  DECLARE unit_price DECIMAL(15,4);
  DECLARE std_cost DECIMAL(15,4);
  DECLARE sales_amt DECIMAL(15,4);

  WHILE i <= 500 DO
    SET order_num = 43659 + FLOOR(i / 3);
    SET line_num = (i % 3) + 1;
    -- Spread orders across 2019-2024
    SET order_date_key = 20190101 + FLOOR(RAND() * 50000) % 21900;
    -- Ensure valid date key format
    SET order_date_key = (2019 + (i % 6)) * 10000 + ((i % 12) + 1) * 100 + ((i % 28) + 1);
    SET cust_key = (i % 50) + 1;
    SET prod_key = (i % 30) + 1;
    SET terr_key = (i % 10) + 1;
    SET qty = FLOOR(1 + RAND() * 5);

    -- Get realistic pricing based on product
    IF prod_key <= 11 THEN
      SET unit_price = 2000 + (prod_key * 150);
      SET std_cost = unit_price * 0.55;
    ELSEIF prod_key <= 19 THEN
      SET unit_price = 50 + (prod_key * 8);
      SET std_cost = unit_price * 0.45;
    ELSE
      SET unit_price = 10 + (prod_key * 2);
      SET std_cost = unit_price * 0.40;
    END IF;

    SET sales_amt = unit_price * qty;

    INSERT IGNORE INTO FactInternetSales VALUES (
      CONCAT('SO', order_num), line_num,
      order_date_key, order_date_key + 5,
      cust_key, prod_key, terr_key,
      qty, unit_price, sales_amt,
      0.00, 0.00, std_cost, std_cost * qty,
      sales_amt, sales_amt * 0.08, sales_amt * 0.02
    );
    SET i = i + 1;
  END WHILE;
END//
DELIMITER ;
CALL populate_internet_sales();
DROP PROCEDURE IF EXISTS populate_internet_sales;

-- ═══════════════════════════════════════════════════════════════
-- FactResellerSales (~300 rows)
-- ═══════════════════════════════════════════════════════════════
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS populate_reseller_sales()
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE order_num INT DEFAULT 71774;
  DECLARE line_num INT;
  DECLARE order_date_key INT;
  DECLARE reseller_key INT;
  DECLARE emp_key INT;
  DECLARE prod_key INT;
  DECLARE terr_key INT;
  DECLARE qty INT;
  DECLARE unit_price DECIMAL(15,4);
  DECLARE std_cost DECIMAL(15,4);
  DECLARE sales_amt DECIMAL(15,4);

  WHILE i <= 300 DO
    SET order_num = 71774 + FLOOR(i / 4);
    SET line_num = (i % 4) + 1;
    SET order_date_key = (2019 + (i % 6)) * 10000 + ((i % 12) + 1) * 100 + ((i % 28) + 1);
    SET reseller_key = (i % 15) + 1;
    SET emp_key = (i % 10) + 1;
    SET prod_key = (i % 30) + 1;
    SET terr_key = (i % 10) + 1;
    SET qty = FLOOR(2 + RAND() * 20);

    IF prod_key <= 11 THEN
      SET unit_price = 1800 + (prod_key * 120);
      SET std_cost = unit_price * 0.52;
    ELSEIF prod_key <= 19 THEN
      SET unit_price = 40 + (prod_key * 7);
      SET std_cost = unit_price * 0.42;
    ELSE
      SET unit_price = 8 + (prod_key * 1.5);
      SET std_cost = unit_price * 0.38;
    END IF;

    SET sales_amt = unit_price * qty;

    INSERT IGNORE INTO FactResellerSales VALUES (
      CONCAT('RSO', order_num), line_num,
      order_date_key, order_date_key + 7,
      reseller_key, emp_key, prod_key, terr_key,
      qty, unit_price, sales_amt,
      0.00, 0.00, std_cost, std_cost * qty,
      sales_amt, sales_amt * 0.075, sales_amt * 0.025
    );
    SET i = i + 1;
  END WHILE;
END//
DELIMITER ;
CALL populate_reseller_sales();
DROP PROCEDURE IF EXISTS populate_reseller_sales;

-- Verify row counts
SELECT 'DimDate' as tbl, COUNT(*) as rows FROM DimDate
UNION ALL SELECT 'DimCustomer', COUNT(*) FROM DimCustomer
UNION ALL SELECT 'DimProduct', COUNT(*) FROM DimProduct
UNION ALL SELECT 'DimSalesTerritory', COUNT(*) FROM DimSalesTerritory
UNION ALL SELECT 'DimEmployee', COUNT(*) FROM DimEmployee
UNION ALL SELECT 'DimReseller', COUNT(*) FROM DimReseller
UNION ALL SELECT 'FactInternetSales', COUNT(*) FROM FactInternetSales
UNION ALL SELECT 'FactResellerSales', COUNT(*) FROM FactResellerSales;
