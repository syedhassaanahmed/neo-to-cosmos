using Microsoft.Azure.CosmosDB.BulkExecutor;
using Microsoft.Azure.CosmosDB.BulkExecutor.Graph;
using Microsoft.Azure.Documents;
using Microsoft.Azure.Documents.Client;
using Serilog;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;

namespace NeoToCosmos
{
    public class CosmosDb
    {
        private readonly ILogger _logger;
        private DocumentClient _documentClient;
        private string _partitionKey;
        private IBulkExecutor _graphBulkExecutor;

        public CosmosDb(ILogger logger)
        {
            _logger = logger;
        }

        public async Task InitializeAsync(bool shouldRestart)
        {
            var (endpoint, authKey, database, collection, partitionKey, offerThroughput) = GetCosmosDbConfiguration();            

            _documentClient = new DocumentClient(new Uri(endpoint), authKey, new ConnectionPolicy
            {
                ConnectionMode = ConnectionMode.Direct,
                ConnectionProtocol = Protocol.Tcp
            });

            if (shouldRestart)
            {
                await HandleRestartAsync(database, collection);
            }

            var documentCollection = await CreateCollectionIfNotExistsAsync(database, collection, partitionKey, offerThroughput);
            _partitionKey = documentCollection.PartitionKey.Paths.FirstOrDefault()?.Replace("/", string.Empty);

            // Set retry options high during initialization (default values).
            _documentClient.ConnectionPolicy.RetryOptions.MaxRetryWaitTimeInSeconds = 30;
            _documentClient.ConnectionPolicy.RetryOptions.MaxRetryAttemptsOnThrottledRequests = 9;

            _graphBulkExecutor = new GraphBulkExecutor(_documentClient, documentCollection);
            await _graphBulkExecutor.InitializeAsync();

            // Set retries to 0 to pass complete control to bulk executor.
            _documentClient.ConnectionPolicy.RetryOptions.MaxRetryWaitTimeInSeconds = 0;
            _documentClient.ConnectionPolicy.RetryOptions.MaxRetryAttemptsOnThrottledRequests = 0;
        }

        private async Task<DocumentCollection> CreateCollectionIfNotExistsAsync(string database, string collection, string partitionKey, int offerThroughput)
        {
            await _documentClient.CreateDatabaseIfNotExistsAsync(new Database { Id = database });
            var documentCollection = await _documentClient.CreateDocumentCollectionIfNotExistsAsync(
                UriFactory.CreateDatabaseUri(database),
                new DocumentCollection
                {
                    Id = collection,
                    PartitionKey = new PartitionKeyDefinition
                    {
                        Paths = new Collection<string> { $"/{partitionKey}" }
                    }
                },
                new RequestOptions { OfferThroughput = offerThroughput });

            return documentCollection.Resource;
        }

        private async Task HandleRestartAsync(string database, string collection)
        {
            var collectionUri = UriFactory.CreateDocumentCollectionUri(database, collection);

            try
            {
                await _documentClient.DeleteDocumentCollectionAsync(
                    UriFactory.CreateDocumentCollectionUri(database, collection));
            }
            catch (DocumentClientException e)
            {
                if (e.StatusCode != System.Net.HttpStatusCode.NotFound)
                {
                    throw;
                }

                _logger.Information($"{collectionUri} doesn't exist");
            }
        }

        private (string, string, string, string, string, int) GetCosmosDbConfiguration()
        {
            var endpoint = Environment.GetEnvironmentVariable("COSMOSDB_ENDPOINT");
            if (string.IsNullOrEmpty(endpoint))
            {
                throw new ArgumentNullException(nameof(endpoint));
            }

            var authKey = Environment.GetEnvironmentVariable("COSMOSDB_AUTH_KEY");
            if (string.IsNullOrEmpty(authKey))
            {
                throw new ArgumentNullException(nameof(authKey));
            }

            var database = Environment.GetEnvironmentVariable("COSMOSDB_DATABASE");
            if (string.IsNullOrEmpty(database))
            {
                throw new ArgumentNullException(nameof(database));
            }

            var collection = Environment.GetEnvironmentVariable("COSMOSDB_COLLECTION");
            if (string.IsNullOrEmpty(collection))
            {
                throw new ArgumentNullException(nameof(collection));
            }

            var partitionKey = Environment.GetEnvironmentVariable("COSMOSDB_PARTITION_KEY");

            var offerThroughputString = Environment.GetEnvironmentVariable("COSMOSDB_OFFER_THROUGHPUT");
            if (!int.TryParse(offerThroughputString, out int offerThroughput))
            {
                offerThroughput = !string.IsNullOrEmpty(partitionKey) ? 1000 : 400;
            }

            return (endpoint, authKey, database, collection, partitionKey, offerThroughput);
        }
    }
}