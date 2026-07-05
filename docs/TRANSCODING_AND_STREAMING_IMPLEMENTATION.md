# AudioBook Backend: Transcoding and Streaming Implementation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Transcoding Process](#transcoding-process)
4. [Streaming Process](#streaming-process)
5. [Caching Strategy](#caching-strategy)
6. [Queue Management](#queue-management)
7. [API Endpoints](#api-endpoints)
8. [Configuration](#configuration)
9. [Error Handling](#error-handling)
10. [Performance Optimization](#performance-optimization)
11. [Monitoring and Analytics](#monitoring-and-analytics)

## Overview

The AudioBook backend implements a comprehensive audio transcoding and streaming system using HLS (HTTP Live Streaming) protocol. The system converts uploaded audio files into multiple bitrates and serves them through adaptive streaming, providing optimal playback experience across different network conditions.

### Key Features

- **Multi-bitrate transcoding** (64kbps, 128kbps, 256kbps)
- **HLS adaptive streaming** with master and variant playlists
- **Redis-based caching** for playlists and segments
- **RabbitMQ queue management** for transcoding jobs
- **Storage abstraction** supporting Local, AWS S3
- **Real-time progress tracking** and status monitoring
- **Rate limiting** and security measures

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App   │    │   Web Browser   │    │   Mobile App   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │ HTTP/HTTPS
                                 ▼
                    ┌─────────────────────────┐
                    │   Express.js Server     │
                    │  (StreamingController)  │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────────┐
                    │   HLSStreamingService   │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────────┐
                    │  StreamingCacheService  │
                    │      (Redis Cache)      │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────────┐
                    │   StorageProvider       │
                    │  (Local/S3 Storage)     │
                    └─────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Admin Panel   │    │   API Client    │    │   Worker Node   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │ HTTP/HTTPS
                                 ▼
                    ┌─────────────────────────┐
                    │   Express.js Server     │
                    │  (StreamingController)  │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────────┐
                    │   RabbitMQ Factory      │
                    │   (Job Queue System)    │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────────┐
                    │   TranscodingWorker     │
                    └─────────┬───────────────┘
                              │
                    ┌─────────▼───────────────┐
                    │   TranscodingService    │
                    │      (FFmpeg)           │
                    └─────────────────────────┘
```

### Data Flow

1. **Upload Phase**: Audio files uploaded → Stored in storage provider
2. **Transcoding Phase**: Jobs queued → FFmpeg processing → HLS segments generated
3. **Streaming Phase**: Client requests → Cache check → Storage fallback → Response

## Transcoding Process

### Step-by-Step Transcoding Workflow

#### 1. Job Initiation

```typescript
// Triggered via API endpoint
POST /api/v1/stream/chapters/{chapterId}/transcode
{
  "bitrates": [64, 128, 256],
  "priority": "normal"
}
```

#### 2. Job Queue Management

```typescript
// Job data structure
interface TranscodingJobData {
  chapterId: string;
  bitrates: number[];
  priority: "low" | "normal" | "high";
  userId?: string;
  retryCount?: number;
}
```

**Queue Priority System:**

- **High Priority**: Premium users, urgent requests
- **Normal Priority**: Standard users, regular requests
- **Low Priority**: Retry attempts, background processing

#### 3. Worker Processing

```typescript
// TranscodingWorker.processTranscodingJob()
async processTranscodingJob(jobData: TranscodingJobData) {
  // 1. Validate chapter exists
  // 2. Check existing transcoded versions
  // 3. Create transcoding job record
  // 4. Start FFmpeg processing
  // 5. Upload results to storage
  // 6. Update database records
  // 7. Publish completion results
}
```

#### 4. FFmpeg Processing

```typescript
// TranscodingService.transcodeToBitrate()
const command = ffmpeg(inputPath)
  .audioCodec("aac")
  .audioBitrate(bitrate)
  .audioChannels(2)
  .audioFrequency(44100)
  .format("hls")
  .outputOptions([
    `-hls_time ${segmentDuration}`,
    `-hls_list_size 0`,
    `-hls_segment_filename ${segmentPattern}`,
    "-hls_flags independent_segments",
  ])
  .output(playlistPath);
```

**FFmpeg Configuration:**

- **Audio Codec**: AAC (Advanced Audio Coding)
- **Channels**: Stereo (2 channels)
- **Sample Rate**: 44.1 kHz
- **Segment Duration**: 10 seconds (configurable)
- **Format**: HLS (HTTP Live Streaming)

#### 5. File Structure Generation

```
transcoded/
├── {chapterId}/
│   ├── master.m3u8                    # Master playlist
│   ├── 64k/
│   │   ├── playlist.m3u8              # Variant playlist
│   │   ├── segment_000.ts             # Audio segments
│   │   ├── segment_001.ts
│   │   └── ...
│   ├── 128k/
│   │   ├── playlist.m3u8
│   │   ├── segment_000.ts
│   │   └── ...
│   └── 256k/
│       ├── playlist.m3u8
│       ├── segment_000.ts
│       └── ...
```

#### 6. Database Updates

```sql
-- TranscodedChapter table
INSERT INTO TranscodedChapter (
  chapterId, bitrate, playlistUrl, segmentsPath,
  storageProvider, status, createdAt, updatedAt
) VALUES (
  'chapter-123', 128, 'chapter-123/128k/playlist.m3u8',
  'chapter-123/128k/', 'local', 'completed', NOW(), NOW()
);

-- TranscodingJob table
INSERT INTO TranscodingJob (
  chapterId, status, progress, startedAt, completedAt
) VALUES (
  'chapter-123', 'completed', 100, NOW(), NOW()
);
```

### Retry Logic and Error Handling

#### Retry Strategy

```typescript
// Maximum 3 retry attempts
if (retryCount < 3) {
  const retryJobData: TranscodingJobData = {
    ...jobData,
    retryCount: retryCount + 1,
    priority: "low", // Lower priority for retries
  };
  await this.publishTranscodingJob(retryJobData, "low");
}
```

#### Error Types

- **File Not Found**: Input audio file missing
- **FFmpeg Errors**: Codec issues, format problems
- **Storage Errors**: Upload failures, permission issues
- **Database Errors**: Connection issues, constraint violations

## Streaming Process

### HLS Streaming Workflow

#### 1. Master Playlist Request

```http
GET /api/v1/stream/chapters/{chapterId}/master.m3u8?bandwidth=1000000&bitrate=128
```

**Response Example:**

```m3u8
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS="mp4a.40.2"
64k/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2",RESOLUTION=0x0
128k/playlist.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=256000,CODECS="mp4a.40.2"
256k/playlist.m3u8
```

#### 2. Variant Playlist Request

```http
GET /api/v1/stream/chapters/{chapterId}/128k/playlist.m3u8
```

**Response Example:**

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10

#EXTINF:10.0,
segment_000.ts
#EXTINF:10.0,
segment_001.ts
#EXTINF:10.0,
segment_002.ts
#EXT-X-ENDLIST
```

#### 3. Segment Request

```http
GET /api/v1/stream/chapters/{chapterId}/128k/segments/segment_000.ts
```

**Response:** Binary audio segment data (video/mp2t)

### Bitrate Selection Algorithm

```typescript
private selectRecommendedBitrate(
  bitrateInfos: BitrateInfo[],
  clientBandwidth?: number,
  preferredBitrate?: number
): number {
  // 1. Check user preference
  if (preferredBitrate && bitrateInfos.some(bi => bi.bitrate === preferredBitrate)) {
    return preferredBitrate;
  }

  // 2. No bandwidth info - use middle bitrate
  if (!clientBandwidth) {
    const sortedBitrates = bitrateInfos.map(bi => bi.bitrate).sort((a, b) => a - b);
    return sortedBitrates[Math.floor(sortedBitrates.length / 2)] || 128;
  }

  // 3. Select highest bitrate within bandwidth
  const suitableBitrates = bitrateInfos.filter(bi => bi.bandwidth <= clientBandwidth);
  if (suitableBitrates.length > 0) {
    return suitableBitrates[suitableBitrates.length - 1]?.bitrate || 128;
  }

  // 4. Fallback to lowest bitrate
  return bitrateInfos[0]?.bitrate || 128;
}
```

### Access Control and Validation

```typescript
private async validateChapterAccess(chapterId: string, userId: string) {
  const chapter = await this.prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      audiobook: {
        select: {
          id: true,
          title: true,
          isPublic: true,
          isActive: true
        }
      }
    }
  });

  // Check if audiobook is active and public
  if (!chapter.audiobook.isActive || !chapter.audiobook.isPublic) {
    return null;
  }

  // TODO: Add user-specific access checks (subscription, purchase, etc.)
  return chapter;
}
```

## Caching Strategy

### Redis Cache Implementation

#### Cache Keys Structure

```
stream:playlist:{chapterId}:master     # Master playlist
stream:playlist:{chapterId}:{bitrate}  # Variant playlist
stream:segment:{segmentId}             # Audio segments
```

#### Cache TTL Configuration

```typescript
// Different TTL for different content types
const cacheTTL = {
  masterPlaylist: 300, // 5 minutes
  variantPlaylist: 60, // 1 minute
  segments: 3600, // 1 hour
  default: 3600, // 1 hour
};
```

#### Cache Operations

**1. Cache Miss Handling**

```typescript
async getWithFallback(key: string, storagePath: string): Promise<Buffer | null> {
  // Try cache first
  let content = await this.get(key);
  if (content) return content;

  // Fallback to storage
  content = await this.storageProvider.downloadFile(storagePath);

  // Cache for future requests
  await this.set(key, content, config.STREAMING_CACHE_TTL);

  return content;
}
```

**2. Preloading Strategy**

```typescript
async preloadChapterSegments(chapterId: string, bitrate: number, segmentCount: number) {
  for (let i = 0; i < segmentCount; i++) {
    const segmentId = `${chapterId}_${bitrate}_${i.toString().padStart(3, '0')}`;
    const storagePath = `transcoded/${chapterId}/${bitrate}k/segment_${i.toString().padStart(3, '0')}.ts`;

    const segmentContent = await this.storageProvider.downloadFile(storagePath);
    await this.cacheSegment(segmentId, segmentContent);
  }
}
```

#### Cache Statistics

```typescript
interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  cacheSize: number;
  redisInfo: any;
  cacheKeys: number;
}
```

## Queue Management

### RabbitMQ Configuration

#### Chapter activation (streaming → app-service)

When all three bitrates (64, 128, 256 kbps) and the master playlist complete successfully, streaming-service publishes to the `chapters` topic exchange:

| Routing key | Queue | Direction |
|-------------|-------|-----------|
| `chapter.transcoding.completed` | `{prefix}.chapters.transcoding.completed` | streaming-service → app-service |

App-service sets `transcodingReady: true` and activates the chapter (`isActive: true`) when:

- Transcoding completed successfully, **and**
- `scheduledAt` is null or in the past (scheduled chapters wait for both transcoding and the scheduled time).

New chapters are created with `isActive: false` and `transcodingReady: false`. Upload success only triggers the transcoding job; it does not activate the chapter.

#### Queue Structure

```
audiobook.transcoding.priority  # High priority jobs
audiobook.transcoding.normal    # Normal priority jobs
audiobook.transcoding.low       # Low priority jobs
audiobook.transcoding.results   # Job completion results
```

#### Exchange Configuration

```typescript
const exchangeConfig: ExchangeConfig = {
  name: "audiobook.transcoding",
  type: "direct",
  durable: true,
  autoDelete: false,
};
```

#### Job Publishing

```typescript
async publishTranscodingJob(jobData: TranscodingJobData, priority: string) {
  const queueName = `audiobook.transcoding.${priority}`;
  const message = JSON.stringify(jobData);

  await this.channel.publish(
    'audiobook.transcoding',
    priority,
    Buffer.from(message),
    {
      persistent: true,
      priority: this.getPriorityValue(priority)
    }
  );
}
```

#### Consumer Setup

```typescript
async consumeTranscodingJobs(queueName: string, callback: Function) {
  await this.channel.consume(queueName, async (message) => {
    if (message) {
      const jobData = JSON.parse(message.content.toString());
      await callback(jobData, message);
      this.channel.ack(message);
    }
  });
}
```

### Job Status Tracking

#### Status Lifecycle

```
pending → processing → completed
   ↓         ↓           ↓
failed ←─── failed ←─── failed
```

#### Progress Updates

```typescript
// Real-time progress tracking
command.on("progress", (progressInfo: any) => {
  if (progressInfo.percent) {
    const progress = Math.round(progressInfo.percent);
    this.updateTranscodingJob(chapterId, bitrate, "processing", progress);
  }
});
```

## API Endpoints

### Streaming Endpoints

#### 1. Master Playlist

```http
GET /api/v1/stream/chapters/{chapterId}/master.m3u8
Query Parameters:
  - bandwidth: Client bandwidth in bps
  - bitrate: Preferred bitrate in kbps
```

#### 2. Variant Playlist

```http
GET /api/v1/stream/chapters/{chapterId}/{bitrate}/playlist.m3u8
```

#### 3. Audio Segment

```http
GET /api/v1/stream/chapters/{chapterId}/{bitrate}/segments/{segmentId}
```

#### 4. Streaming Status

```http
GET /api/v1/stream/chapters/{chapterId}/status
Response:
{
  "chapterId": "chapter-123",
  "availableBitrates": [64, 128, 256],
  "transcodingStatus": "completed",
  "canStream": true,
  "estimatedBandwidth": 256000
}
```

### Management Endpoints

#### 1. Trigger Transcoding

```http
POST /api/v1/stream/chapters/{chapterId}/transcode
Body:
{
  "bitrates": [64, 128, 256],
  "priority": "normal"
}
```

#### 2. Preload Chapter

```http
POST /api/v1/stream/chapters/{chapterId}/preload
Body:
{
  "bitrate": 128
}
```

#### 3. Analytics

```http
GET /api/v1/stream/analytics?chapterId={chapterId}
Response:
{
  "totalRequests": 1500,
  "cacheHitRate": 85.5,
  "averageBandwidth": 180000,
  "popularBitrates": [
    {"bitrate": 128, "requests": 800},
    {"bitrate": 256, "requests": 500},
    {"bitrate": 64, "requests": 200}
  ]
}
```

#### 4. Health Check

```http
GET /api/v1/stream/health
Response:
{
  "status": "healthy",
  "components": {
    "database": true,
    "redis": true,
    "rabbitmq": true,
    "storage": true,
    "ffmpeg": true
  }
}
```

## Configuration

### Environment Variables

```bash
# Streaming Configuration
STREAMING_PORT=3001
HLS_SEGMENT_DURATION=10
TRANSCODING_BITRATES=64,128,256
STREAMING_CACHE_TTL=3600

# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE_PREFIX=audiobook

# Storage Configuration
STORAGE_PROVIDER=local  # local, s3
AWS_S3_BUCKET=audiobook-storage
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password
```

### FFmpeg Requirements

**Installation:**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

**Required Codecs:**

- AAC encoder
- HLS muxer
- MP4 demuxer

## Error Handling

### Error Types and Responses

#### 1. Client Errors (4xx)

```typescript
// 400 Bad Request
{
  "success": false,
  "message": "Invalid bitrate specified",
  "statusCode": 400
}

// 401 Unauthorized
{
  "success": false,
  "message": "Authentication required",
  "statusCode": 401
}

// 404 Not Found
{
  "success": false,
  "message": "Chapter not found or no transcoded versions available",
  "statusCode": 404
}

// 429 Too Many Requests
{
  "success": false,
  "message": "Rate limit exceeded for streaming endpoints",
  "statusCode": 429
}
```

#### 2. Server Errors (5xx)

```typescript
// 500 Internal Server Error
{
  "success": false,
  "message": "Internal server error",
  "statusCode": 500
}

// 503 Service Unavailable
{
  "status": "degraded",
  "components": {
    "database": true,
    "redis": false,
    "rabbitmq": true,
    "storage": true,
    "ffmpeg": true
  }
}
```

### Error Recovery Strategies

#### 1. Transcoding Failures

- **Retry Logic**: Up to 3 attempts with exponential backoff
- **Fallback**: Use existing bitrates if partial transcoding completed
- **Notification**: Alert administrators for persistent failures

#### 2. Cache Failures

- **Graceful Degradation**: Fallback to storage provider
- **Cache Warming**: Preload popular content
- **Monitoring**: Track cache hit rates and performance

#### 3. Storage Failures

- **Redundancy**: Multiple storage providers
- **Health Checks**: Regular connectivity tests
- **Failover**: Automatic switching to backup storage

## Performance Optimization

### Caching Strategies

#### 1. Multi-Level Caching

```
Client Cache → CDN → Redis Cache → Storage Provider
```

#### 2. Cache Warming

```typescript
// Preload popular chapters
async warmupCache() {
  const popularChapters = await this.getPopularChapters();

  for (const chapter of popularChapters) {
    await this.preloadChapter(chapter.id, 128); // Preload 128k bitrate
  }
}
```

#### 3. Cache Invalidation

```typescript
// Clear cache when content updates
async invalidateChapterCache(chapterId: string) {
  const pattern = `stream:*:${chapterId}:*`;
  const keys = await this.redis.getClient().keys(pattern);

  if (keys.length > 0) {
    await this.redis.getClient().del(...keys);
  }
}
```

### Rate Limiting

#### Implementation

```typescript
const streamingRateLimit = (req: any, res: any, next: any) => {
  const clientId = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100; // Max requests per minute

  // Rate limiting logic...
};
```

#### Limits Configuration

- **Master Playlist**: 10 requests/minute
- **Variant Playlist**: 20 requests/minute
- **Segments**: 100 requests/minute
- **Status/Health**: 60 requests/minute

### Compression and Optimization

#### 1. Response Compression

```typescript
// Enable gzip compression for playlists
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
```

#### 2. HTTP/2 Support

- **Multiplexing**: Multiple requests over single connection
- **Server Push**: Proactive segment delivery
- **Header Compression**: Reduced overhead

#### 3. CDN Integration

```typescript
// CDN configuration for static assets
const cdnConfig = {
  baseUrl: "https://cdn.audiobook.com",
  cacheTTL: 86400, // 24 hours
  compression: true,
};
```

## Monitoring and Analytics

### Metrics Collection

#### 1. Streaming Metrics

```typescript
interface StreamingMetrics {
  totalRequests: number;
  cacheHitRate: number;
  averageBandwidth: number;
  popularBitrates: Array<{ bitrate: number; requests: number }>;
  errorRate: number;
  responseTime: number;
}
```

#### 2. Transcoding Metrics

```typescript
interface TranscodingMetrics {
  jobsProcessed: number;
  averageProcessingTime: number;
  successRate: number;
  queueLength: number;
  workerUtilization: number;
}
```

#### 3. System Health Metrics

```typescript
interface HealthMetrics {
  database: {
    connectionPool: number;
    queryTime: number;
    errorRate: number;
  };
  redis: {
    memoryUsage: number;
    hitRate: number;
    connectionCount: number;
  };
  storage: {
    responseTime: number;
    errorRate: number;
    availableSpace: number;
  };
}
```

### Logging Strategy

#### 1. Structured Logging

```typescript
// Winston logger configuration
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console(),
  ],
});
```

#### 2. Log Levels

- **ERROR**: System failures, transcoding errors
- **WARN**: Performance issues, cache misses
- **INFO**: Job completion, cache hits
- **DEBUG**: Detailed processing information

#### 3. Log Aggregation

- **ELK Stack**: Elasticsearch, Logstash, Kibana
- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards

### Alerting System

#### 1. Critical Alerts

- **Transcoding Queue Backup**: > 100 pending jobs
- **Cache Hit Rate Drop**: < 70% hit rate
- **Storage Space**: < 10% available
- **Error Rate Spike**: > 5% error rate

#### 2. Warning Alerts

- **High Response Time**: > 2 seconds average
- **Worker Utilization**: > 90% CPU usage
- **Memory Usage**: > 80% Redis memory

#### 3. Alert Channels

- **Email**: Critical system alerts
- **Slack**: Team notifications
- **PagerDuty**: On-call escalation

---

## Conclusion

This comprehensive transcoding and streaming implementation provides a robust, scalable solution for audio content delivery. The system handles everything from initial audio processing to adaptive streaming delivery, with built-in caching, monitoring, and error recovery mechanisms.

### Key Benefits

- **Scalability**: Queue-based processing with multiple workers
- **Reliability**: Comprehensive error handling and retry logic
- **Performance**: Multi-level caching and optimization
- **Flexibility**: Support for multiple storage providers
- **Monitoring**: Detailed analytics and health checks

### Future Enhancements

- **Live Streaming**: Real-time audio streaming support
- **Advanced Analytics**: User behavior tracking
- **AI Optimization**: Dynamic bitrate selection based on content analysis
- **Global CDN**: Worldwide content distribution
- **Mobile Optimization**: Enhanced mobile streaming protocols
