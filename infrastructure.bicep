// This file defines all the Azure resources our project needs.

// --- Parameters ---
// Parameters are like function arguments. They make our template reusable.
@description('The geographic location for our resources.')
param location string = resourceGroup().location

@description('A unique name for our project. Use lowercase letters and numbers only. E.g., datalab001')
param projectName string = 'datalab${uniqueString(resourceGroup().id)}'

// --- Variables ---
// Variables store values we construct and reuse within this file.
var storageAccountName = '${projectName}sa'
var appInsightsName = '${projectName}-ai'
var functionAppName = '${projectName}-func'
var serverlessPlanName = '${projectName}-plan'
var cosmosAccountName = '${projectName}-cosmos'
var sqlServerName = '${projectName}-sqlserver'
var sqlDatabaseName = 'SampleDB'

// --- Resources ---
// These are the actual cloud services that will be created in Azure.

// 1. Storage Account: Required by the Function App and will also host our Queues.
resource storageAccount 'Microsoft.Storage/storageAccounts@2021-09-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS' // The cheapest, locally-redundant storage.
  }
  kind: 'StorageV2'
}

// 2. Application Insights: For monitoring, logging, and debugging our serverless functions.
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

// 3. Serverless Consumption Plan: The hosting plan for our Function App. We only pay when functions run.
resource serverlessPlan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: serverlessPlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
}

// 4. Function App: The app that will host and run our backend JavaScript function code.
resource functionApp 'Microsoft.Web/sites@2022-03-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: serverlessPlan.id
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          // *** FIX WAS HERE: Changed environment().storage.suffix to environment().suffixes.storage ***
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
      ]
    }
  }
}

// 5. Cosmos DB Account: A NoSQL database to store our query session history.
resource cosmosAccount 'Microsoft.DBforCosmosDB/databaseAccounts@2022-05-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
      }
    ]
    // Use serverless capacity to keep costs very low for our project's workload.
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

// 6. SQL Server and Database: The relational database our users will query with natural language.
resource sqlServer 'Microsoft.Sql/servers@2022-05-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: 'sqladmin'
    // IMPORTANT: Change this to a strong, unique password!
    administratorLoginPassword: 'Mani@2002*'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2022-05-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  sku: {
    name: 'S0' // A basic, low-cost SKU suitable for a student project.
  }
}


// --- Outputs ---
// Outputs are values from our deployment that we'll need later, like connection strings.
output AZURE_COSMOS_CONNECTION_STRING string = cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
// *** FIX WAS HERE: Changed environment().storage.suffix to environment().suffixes.storage ***
output AZURE_STORAGE_CONNECTION_STRING string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
output AZURE_SQL_SERVER_NAME string = sqlServer.name