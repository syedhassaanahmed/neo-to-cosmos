FROM mcr.microsoft.com/dotnet/core/sdk:3.1-alpine AS build
WORKDIR /src
COPY ["NeoToCosmos/NeoToCosmos.csproj", "NeoToCosmos/"]
RUN dotnet restore "NeoToCosmos/NeoToCosmos.csproj"
COPY . .
WORKDIR "/src/NeoToCosmos"
RUN dotnet build "NeoToCosmos.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "NeoToCosmos.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/core/runtime:3.1-alpine AS final
RUN echo "@edgetesting http://dl-cdn.alpinelinux.org/alpine/edge/testing" >>/etc/apk/repositories && \
    apk add --update rocksdb-dev@edgetesting && \
    rm -rf /var/cache/apk/*
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "NeoToCosmos.dll"]
