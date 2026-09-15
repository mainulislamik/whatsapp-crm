from django.db import models

class Contact(models.Model):
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=50, unique=True, db_index=True)
    email = models.EmailField(blank=True, null=True)
    tags = models.CharField(max_length=255, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.phone})"


class MessageTemplate(models.Model):
    name = models.CharField(max_length=255)
    content = models.TextField()
    category = models.CharField(max_length=100, default='General')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class Campaign(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('SCHEDULED', 'Scheduled'),
        ('RUNNING', 'Running'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
        ('FAILED', 'Failed'),
    ]

    title = models.CharField(max_length=255)
    template_content = models.TextField()
    total_recipients = models.IntegerField(default=0)
    sent_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    delay_seconds = models.IntegerField(default=5)
    
    # Media Attachment Support
    media_base64 = models.TextField(null=True, blank=True)
    media_type = models.CharField(max_length=20, null=True, blank=True) # 'image' or 'document'
    file_name = models.CharField(max_length=255, null=True, blank=True)
    mime_type = models.CharField(max_length=100, null=True, blank=True)

    # Scheduling Support
    scheduled_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.status})"


class CampaignLog(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('SENT', 'Sent'),
        ('FAILED', 'Failed'),
    ]

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='logs')
    contact_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50)
    message = models.TextField()
    has_media = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    error_message = models.TextField(blank=True, null=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.phone} - {self.status}"


class LeadCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Lead(models.Model):
    STATUS_CHOICES = [
        ('NEW', 'New'),
        ('CONTACTED', 'Contacted'),
        ('IN_PROGRESS', 'In Progress'),
        ('INTERESTED', 'Interested'),
        ('QUALIFIED', 'Qualified'),
        ('CONVERTED', 'Converted'),
        ('LOST', 'Lost'),
    ]

    phone = models.CharField(max_length=50, db_index=True)
    shop_name = models.CharField(max_length=255)
    owner_name = models.CharField(max_length=255, blank=True, default='')
    category = models.CharField(max_length=100, blank=True, default='General')
    shop_type = models.CharField(max_length=100, blank=True, default='Retail')

    # WhatsApp Scanned Enrichment
    is_on_whatsapp = models.BooleanField(default=False)
    whatsapp_name = models.CharField(max_length=255, blank=True, default='')
    whatsapp_profile_pic = models.TextField(blank=True, default='')
    whatsapp_about = models.TextField(blank=True, default='')

    # Outreach & Message Sent Tracking
    is_contacted = models.BooleanField(default=False, db_index=True)
    last_contacted_at = models.DateTimeField(null=True, blank=True)
    sent_messages_count = models.IntegerField(default=0)

    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='NEW')
    address = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')

    # Live Chat Integration
    whatsapp_jid = models.CharField(max_length=100, blank=True, default='')  # e.g. 88018xxxx@s.whatsapp.net

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.shop_name} - {self.phone}"


class ChatMessage(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('SENT', 'Sent'),
        ('DELIVERED', 'Delivered'),
        ('READ', 'Read'),
        ('RECEIVED', 'Received'),
        ('FAILED', 'Failed'),
    ]

    whatsapp_msg_id = models.CharField(max_length=255, blank=True, db_index=True)
    phone = models.CharField(max_length=50, db_index=True)
    jid = models.CharField(max_length=100, db_index=True)
    sender_name = models.CharField(max_length=255, blank=True, default='')
    is_from_me = models.BooleanField(default=False)
    message_text = models.TextField(blank=True, default='')
    
    # Media support
    media_type = models.CharField(max_length=50, blank=True, default='')  # 'image', 'document', 'audio', 'video'
    media_url = models.TextField(blank=True, default='')
    media_caption = models.TextField(blank=True, default='')
    file_name = models.CharField(max_length=255, blank=True, default='')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DELIVERED')
    is_read = models.BooleanField(default=False)
    timestamp = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['phone', 'timestamp']),
            models.Index(fields=['jid', 'timestamp']),
        ]

    def __str__(self):
        direction = "OUT" if self.is_from_me else "IN"
        return f"[{direction}] {self.phone}: {self.message_text[:30]}"
