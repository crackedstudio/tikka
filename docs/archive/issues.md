#787 [backend] Standardise all controller error responses via BaseExceptionFilter
Repo Avatar
crackedstudio/tikka
Summary
backend/src/common/filters/base-exception.filter.ts exists but it is unclear if all modules register it globally. Some controllers may still throw raw Error objects which produce 500 with an unexpected body shape.

What to do
Register BaseExceptionFilter globally in backend/src/main.ts using app.useGlobalFilters().
Ensure the filter maps:
NestJS built-in HTTP exceptions → { error, message, statusCode }
Unhandled errors → generic 500 without stack traces in production.
Add an X-Request-Id field to error responses (the request ID middleware already generates this header).
Write a test that triggers an unhandled error and asserts the response shape.
Acceptance criteria
All API error responses have the same JSON envelope shape.
Stack traces are never exposed in non-local environments.

#782 [backend] Rename Proccessors directory to Processors (typo)
Repo Avatar
crackedstudio/tikka
Summary
The backend has a directory backend/src/Proccessors/ (double 'c') and a correctly-spelled backend/src/processors/ directory. Both exist simultaneously, which is confusing and wastes attention on every PR.

What to do
Check what is inside backend/src/Proccessors/ticket.proccesor.ts vs backend/src/processors/ticket.processor.ts.
If they are duplicates, delete the misspelled directory.
If they differ, merge the logic into the correctly-spelled file.
Update any imports referencing the misspelled path.
Ensure pnpm build in backend/ still succeeds.
Acceptance criteria
Only one processors/ directory exists in backend/src/.
No import in the codebase references the misspelled path.

#784 [backend] Extract Swagger response schemas from inline decorators to shared DTOs
Repo Avatar
crackedstudio/tikka
Summary
RafflesController and other controllers use inline @ApiResponse decorators with raw object shapes instead of typed DTO classes. This makes the generated Swagger spec incomplete and the API contract harder to maintain.

What to do
For each controller response shape, create a dedicated DTO class in the dto/ folder (e.g. RaffleDetailResponseDto, RaffleListResponseDto).
Decorate them with @ApiProperty() for every field.
Reference them in the controller via @ApiResponse({ type: RaffleDetailResponseDto }).
Verify the Swagger UI at http://localhost:3001/docs reflects the full schema.
Acceptance criteria
All @ApiResponse decorators reference typed DTO classes.
The generated OpenAPI JSON contains complete schema definitions for all response bodies.


#789 [backend] Validate image upload MIME type server-side with magic bytes
Repo Avatar
crackedstudio/tikka
Summary
backend/src/config/upload.config.ts defines ALLOWED_UPLOAD_MIME_TYPES but image validation likely relies only on the client-supplied Content-Type header, which can be spoofed. A malicious user could upload a script with a image/jpeg header.

What to do
Install file-type (a Node.js package that reads magic bytes from the file buffer).
In the upload handler in raffles.controller.ts, after receiving the multipart stream, detect the real MIME type from the first bytes of the buffer.
Reject uploads whose detected MIME type is not in ALLOWED_UPLOAD_MIME_TYPES with a 400 Bad Request.
Add a test that uploads a renamed text file with a JPEG content-type and asserts a 400 response.
Acceptance criteria
Uploading a non-image file with a spoofed image/jpeg header returns 400.
Valid JPEG, PNG, and WebP uploads still succeed.