FROM mcr.microsoft.com/dotnet/core/sdk:2.2-alpine3.9 AS build
WORKDIR /src
COPY ["NeoToCosmos/NeoToCosmos.csproj", "NeoToCosmos/"]
RUN dotnet restore "NeoToCosmos/NeoToCosmos.csproj"
COPY . .
WORKDIR "/src/NeoToCosmos"
RUN dotnet build "NeoToCosmos.csproj" -c Release -o /app

FROM build AS publish
RUN dotnet publish "NeoToCosmos.csproj" -c Release -o /app

FROM mcr.microsoft.com/dotnet/core/runtime:2.2-alpine3.9 AS final
RUN echo "@edgetesting http://dl-cdn.alpinelinux.org/alpine/edge/testing" >>/etc/apk/repositories && \
    apk add --update rocksdb-dev@edgetesting libstdc++ && \
    rm -rf /var/cache/apk/*
WORKDIR /app
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "NeoToCosmos.dll"]
