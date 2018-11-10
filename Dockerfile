FROM microsoft/dotnet:2.1-runtime-alpine AS base
WORKDIR /app

FROM microsoft/dotnet:2.1-sdk-alpine AS build
WORKDIR /src
COPY ["NeoToCosmos/NeoToCosmos.csproj", "NeoToCosmos/"]
RUN dotnet restore "NeoToCosmos/NeoToCosmos.csproj"
COPY . .
WORKDIR "/src/NeoToCosmos"
RUN dotnet build "NeoToCosmos.csproj" -c Release -o /app

FROM build AS publish
RUN dotnet publish "NeoToCosmos.csproj" -c Release -o /app

FROM base AS final
WORKDIR /app
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "NeoToCosmos.dll"]
