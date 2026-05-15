-- AdventureWorks Data Warehouse — MySQL Schema
-- Adapted from Microsoft AdventureWorksDW for demo purposes

USE adventureworks;

-- ═══════════════════════════════════════════════════════════════
-- Dimension Tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS DimDate (
  DateKey INT PRIMARY KEY,
  FullDateAlternateKey DATE,
  DayNumberOfWeek INT,
  EnglishDayNameOfWeek VARCHAR(20),
  MonthNumberOfYear INT,
  EnglishMonthName VARCHAR(20),
  CalendarQuarter INT,
  CalendarYear INT,
  CalendarSemester INT,
  FiscalQuarter INT,
  FiscalYear INT
);

CREATE TABLE IF NOT EXISTS DimGeography (
  GeographyKey INT PRIMARY KEY AUTO_INCREMENT,
  City VARCHAR(100),
  StateProvinceCode VARCHAR(10),
  StateProvinceName VARCHAR(100),
  CountryRegionCode VARCHAR(10),
  EnglishCountryRegionName VARCHAR(100),
  PostalCode VARCHAR(20),
  SalesTerritoryKey INT
);

CREATE TABLE IF NOT EXISTS DimSalesTerritory (
  SalesTerritoryKey INT PRIMARY KEY AUTO_INCREMENT,
  SalesTerritoryRegion VARCHAR(100),
  SalesTerritoryCountry VARCHAR(100),
  SalesTerritoryGroup VARCHAR(100),
  SalesTerritoryImage BLOB
);

CREATE TABLE IF NOT EXISTS DimProductCategory (
  ProductCategoryKey INT PRIMARY KEY AUTO_INCREMENT,
  EnglishProductCategoryName VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS DimProductSubcategory (
  ProductSubcategoryKey INT PRIMARY KEY AUTO_INCREMENT,
  EnglishProductSubcategoryName VARCHAR(100),
  ProductCategoryKey INT,
  FOREIGN KEY (ProductCategoryKey) REFERENCES DimProductCategory(ProductCategoryKey)
);

CREATE TABLE IF NOT EXISTS DimProduct (
  ProductKey INT PRIMARY KEY AUTO_INCREMENT,
  EnglishProductName VARCHAR(200),
  StandardCost DECIMAL(15,4),
  ListPrice DECIMAL(15,4),
  Color VARCHAR(50),
  Size VARCHAR(20),
  Weight DECIMAL(10,2),
  ProductLine VARCHAR(10),
  Class VARCHAR(10),
  Style VARCHAR(10),
  ProductSubcategoryKey INT,
  StartDate DATE,
  EndDate DATE,
  Status VARCHAR(20),
  FOREIGN KEY (ProductSubcategoryKey) REFERENCES DimProductSubcategory(ProductSubcategoryKey)
);

CREATE TABLE IF NOT EXISTS DimCustomer (
  CustomerKey INT PRIMARY KEY AUTO_INCREMENT,
  FirstName VARCHAR(100),
  LastName VARCHAR(100),
  MiddleName VARCHAR(100),
  EmailAddress VARCHAR(200),
  Gender VARCHAR(10),
  MaritalStatus VARCHAR(10),
  YearlyIncome DECIMAL(15,2),
  TotalChildren INT,
  NumberChildrenAtHome INT,
  EnglishEducation VARCHAR(50),
  EnglishOccupation VARCHAR(50),
  HouseOwnerFlag INT,
  NumberCarsOwned INT,
  DateFirstPurchase DATE,
  GeographyKey INT,
  FOREIGN KEY (GeographyKey) REFERENCES DimGeography(GeographyKey)
);

CREATE TABLE IF NOT EXISTS DimEmployee (
  EmployeeKey INT PRIMARY KEY AUTO_INCREMENT,
  FirstName VARCHAR(100),
  LastName VARCHAR(100),
  Title VARCHAR(100),
  HireDate DATE,
  BirthDate DATE,
  EmailAddress VARCHAR(200),
  Phone VARCHAR(50),
  DepartmentName VARCHAR(100),
  BaseRate DECIMAL(10,2),
  VacationHours INT,
  SickLeaveHours INT,
  SalesPersonFlag INT,
  ManagerKey INT
);

CREATE TABLE IF NOT EXISTS DimReseller (
  ResellerKey INT PRIMARY KEY AUTO_INCREMENT,
  ResellerName VARCHAR(200),
  BusinessType VARCHAR(50),
  NumberEmployees INT,
  AnnualSales DECIMAL(15,2),
  AnnualRevenue DECIMAL(15,2),
  YearOpened INT,
  GeographyKey INT,
  FOREIGN KEY (GeographyKey) REFERENCES DimGeography(GeographyKey)
);

-- ═══════════════════════════════════════════════════════════════
-- Fact Tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS FactInternetSales (
  SalesOrderNumber VARCHAR(30),
  SalesOrderLineNumber INT,
  OrderDateKey INT,
  ShipDateKey INT,
  CustomerKey INT,
  ProductKey INT,
  SalesTerritoryKey INT,
  OrderQuantity INT,
  UnitPrice DECIMAL(15,4),
  ExtendedAmount DECIMAL(15,4),
  UnitPriceDiscountPct DECIMAL(5,4),
  DiscountAmount DECIMAL(15,4),
  ProductStandardCost DECIMAL(15,4),
  TotalProductCost DECIMAL(15,4),
  SalesAmount DECIMAL(15,4),
  TaxAmt DECIMAL(15,4),
  Freight DECIMAL(15,4),
  PRIMARY KEY (SalesOrderNumber, SalesOrderLineNumber),
  FOREIGN KEY (OrderDateKey) REFERENCES DimDate(DateKey),
  FOREIGN KEY (CustomerKey) REFERENCES DimCustomer(CustomerKey),
  FOREIGN KEY (ProductKey) REFERENCES DimProduct(ProductKey),
  FOREIGN KEY (SalesTerritoryKey) REFERENCES DimSalesTerritory(SalesTerritoryKey)
);

CREATE TABLE IF NOT EXISTS FactResellerSales (
  SalesOrderNumber VARCHAR(30),
  SalesOrderLineNumber INT,
  OrderDateKey INT,
  ShipDateKey INT,
  ResellerKey INT,
  EmployeeKey INT,
  ProductKey INT,
  SalesTerritoryKey INT,
  OrderQuantity INT,
  UnitPrice DECIMAL(15,4),
  ExtendedAmount DECIMAL(15,4),
  UnitPriceDiscountPct DECIMAL(5,4),
  DiscountAmount DECIMAL(15,4),
  ProductStandardCost DECIMAL(15,4),
  TotalProductCost DECIMAL(15,4),
  SalesAmount DECIMAL(15,4),
  TaxAmt DECIMAL(15,4),
  Freight DECIMAL(15,4),
  PRIMARY KEY (SalesOrderNumber, SalesOrderLineNumber),
  FOREIGN KEY (OrderDateKey) REFERENCES DimDate(DateKey),
  FOREIGN KEY (ResellerKey) REFERENCES DimReseller(ResellerKey),
  FOREIGN KEY (EmployeeKey) REFERENCES DimEmployee(EmployeeKey),
  FOREIGN KEY (ProductKey) REFERENCES DimProduct(ProductKey),
  FOREIGN KEY (SalesTerritoryKey) REFERENCES DimSalesTerritory(SalesTerritoryKey)
);

-- Indexes for common query patterns
CREATE INDEX idx_fis_orderdate ON FactInternetSales(OrderDateKey);
CREATE INDEX idx_fis_customer ON FactInternetSales(CustomerKey);
CREATE INDEX idx_fis_product ON FactInternetSales(ProductKey);
CREATE INDEX idx_fis_territory ON FactInternetSales(SalesTerritoryKey);
CREATE INDEX idx_frs_orderdate ON FactResellerSales(OrderDateKey);
CREATE INDEX idx_frs_product ON FactResellerSales(ProductKey);
CREATE INDEX idx_frs_territory ON FactResellerSales(SalesTerritoryKey);
