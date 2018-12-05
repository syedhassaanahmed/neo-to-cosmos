FROM microsoft/dotnet:2.2-sdk-alpine3.8 AS build
WORKDIR /src
COPY ["NeoToCosmos/NeoToCosmos.csproj", "NeoToCosmos/"]
RUN dotnet restore "NeoToCosmos/NeoToCosmos.csproj"
COPY . .
WORKDIR "/src/NeoToCosmos"
RUN dotnet build "NeoToCosmos.csproj" -c Release -o /app

FROM build AS publish
RUN dotnet publish "NeoToCosmos.csproj" -c Release -o /app

FROM microsoft/dotnet:2.2-runtime-alpine3.8 AS final
RUN echo "@edgemain http://dl-cdn.alpinelinux.org/alpine/edge/main" >>/etc/apk/repositories && \
    echo "@edgetesting http://dl-cdn.alpinelinux.org/alpine/edge/testing" >>/etc/apk/repositories && \
    apk add --update rocksdb-dev@edgetesting libstdc++@edgemain && \
    rm -rf /var/cache/apk/*
WORKDIR /app
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "NeoToCosmos.dll"]
