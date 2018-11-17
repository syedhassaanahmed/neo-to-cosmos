using RocksDbSharp;
using System;
using System.IO;

namespace NeoToCosmos
{
    public class Cache : IDisposable
    {
        private readonly RocksDb _rocksDb;

        public Cache(bool shouldRestart)
        {
            var cachePath = Environment.GetEnvironmentVariable("CACHE_PATH") ?? "cache";

            if (shouldRestart)
            {
                var di = new DirectoryInfo(cachePath);
                if(di.Exists)
                {
                    foreach (var file in di.GetFiles())
                    {
                        file.Delete();
                    }
                }
            }

            var options = new DbOptions().SetCreateIfMissing(true);
            _rocksDb = RocksDb.Open(options, cachePath);
        }

        private static void HandleRestart(string cachePath)
        {
            var di = new DirectoryInfo(cachePath);

            foreach (var file in di.GetFiles())
            {
                file.Delete();
            }
        }

        public string Get(string key)
        {
            return _rocksDb.Get(key);
        }

        public void Set(string key, string value)
        {
            _rocksDb.Put(key, value);
        }

        public void Dispose()
        {
            _rocksDb.Dispose();
        }
    }
}
