FROM microsoft/dotnet:2.1-sdk AS build
WORKDIR /src
COPY ["NeoToCosmos/NeoToCosmos.csproj", "NeoToCosmos/"]
RUN dotnet restore "NeoToCosmos/NeoToCosmos.csproj"
COPY . .
WORKDIR "/src/NeoToCosmos"
RUN dotnet build "NeoToCosmos.csproj" -c Release -o /app

FROM build AS publish
RUN dotnet publish "NeoToCosmos.csproj" -c Release -o /app

FROM microsoft/dotnet:2.1-runtime AS final
RUN apt-get update &&\
    apt-get install -y --no-install-recommends libc6-dev &&\
    apt-get install -y libsnappy-dev
WORKDIR /app
COPY --from=publish /app .
ENTRYPOINT ["dotnet", "NeoToCosmos.dll"]
