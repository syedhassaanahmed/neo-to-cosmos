using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;

namespace NeoToCosmos.Unit.Tests
{
    [TestClass]
    public class MigratorTests
    {
        [TestMethod]
        public void GetDataBounds_SingleInstance_ReturnsCorrectBounds()
        {
            // ARRANGE
            var commandLineOptions = new CommandLineOptions { InstanceId = 0, TotalInstances = 1 };
            var migrator = new Migrator(commandLineOptions, null, null, null, null);

            // ACT
            var (startNodeIndex, endNodeIndex, startRelationshipIndex, endRelationshipIndex) =
                migrator.GetDataBounds(43, 258);

            // ASSERT
            Assert.AreEqual(0, startNodeIndex);
            Assert.AreEqual(43, endNodeIndex);
            Assert.AreEqual(0, startRelationshipIndex);
            Assert.AreEqual(258, endRelationshipIndex);
        }

        [TestMethod]
        public void GetDataBounds_MultipleInstances_ReturnsCorrectBounds()
        {
            // ARRANGE
            var commandLineOptions = new CommandLineOptions { InstanceId = 1, TotalInstances = 3 };
            var migrator = new Migrator(commandLineOptions, null, null, null, null);

            // ACT
            var (startNodeIndex, endNodeIndex, startRelationshipIndex, endRelationshipIndex) =
                migrator.GetDataBounds(43, 259);

            // ASSERT
            Assert.AreEqual(15, startNodeIndex);
            Assert.AreEqual(28, endNodeIndex);
            Assert.AreEqual(87, startRelationshipIndex);
            Assert.AreEqual(172, endRelationshipIndex);
        }

        [TestMethod]
        public void AddProperties_CosmosDbSystemProperty_Renames()
        {
            // ARRANGE
            var properties = new Dictionary<string, object>
            {
                { "id", "some id" },
                { "anotherProperty", "some value" }
            };

            // ACT
            var result = new Dictionary<string, object>();
            Migrator.AddProperties(properties, (n, v) => result.Add(n, v));

            // ASSERT
            CollectionAssert.DoesNotContain(result.Keys, "id");
            CollectionAssert.Contains(result.Keys, "prop_id");
            CollectionAssert.Contains(result.Keys, "anotherProperty");
        }

        [TestMethod]
        public void AddProperties_Enumerable_Serializes()
        {
            // ARRANGE
            var properties = new Dictionary<string, object>
            {
                { "regularProperty", "some value" },
                { "arrayProperty", new [] { "value 1", "value 2" } }
            };

            // ACT
            var result = new Dictionary<string, object>();
            Migrator.AddProperties(properties, (n, v) => result.Add(n, v));

            // ASSERT
            Assert.AreEqual("some value", result["regularProperty"]);

            var arrayPropertyValue = result["arrayProperty"];
            Assert.IsNotInstanceOfType(arrayPropertyValue, typeof(IEnumerable<object>));
            Assert.IsTrue(arrayPropertyValue.ToString().StartsWith("["));
            Assert.IsTrue(arrayPropertyValue.ToString().EndsWith("]"));
        }
    }
}