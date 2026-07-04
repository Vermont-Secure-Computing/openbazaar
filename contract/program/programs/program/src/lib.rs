use anchor_lang::prelude::*;

declare_id!("9MfxguocK4gW2CZigXwpj97YumQ6a8S4twXGLfnaw3tj");

#[program]
pub mod sol_bazaar {
    use super::*;

    pub fn create_merchant(
        ctx: Context<CreateMerchant>,
        store_name: String,
        description_uri: String,
        logo_uri: String,
        banner_uri: String,
        location: String,
    ) -> Result<()> {
        require!(store_name.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(logo_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(banner_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(location.len() <= 64, MarketplaceError::TextTooLong);

        let merchant = &mut ctx.accounts.merchant_profile;

        merchant.authority = ctx.accounts.authority.key();
        merchant.store_name = store_name;
        merchant.description_uri = description_uri;
        merchant.logo_uri = logo_uri;
        merchant.banner_uri = banner_uri;
        merchant.location = location;
        merchant.active = true;
        merchant.created_at = Clock::get()?.unix_timestamp;
        merchant.bump = ctx.bumps.merchant_profile;
        merchant.verified = false;

        Ok(())
    }

    pub fn update_merchant(
        ctx: Context<UpdateMerchant>,
        store_name: String,
        description_uri: String,
        logo_uri: String,
        banner_uri: String,
        location: String,
        active: bool,
    ) -> Result<()> {
        require!(store_name.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(logo_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(banner_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(location.len() <= 64, MarketplaceError::TextTooLong);

        let merchant = &mut ctx.accounts.merchant_profile;

        merchant.store_name = store_name;
        merchant.description_uri = description_uri;
        merchant.logo_uri = logo_uri;
        merchant.banner_uri = banner_uri;
        merchant.location = location;
        merchant.active = active;

        Ok(())
    }

    pub fn create_product(
        ctx: Context<CreateProduct>,
        product_id: u64,
        title: String,
        description_uri: String,
        image_uri: String,
        category: String,
        price: u64,
        stock: u32,
    ) -> Result<()> {
        require!(title.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(image_uri.len() <= 250, MarketplaceError::TextTooLong);
        require!(category.len() <= 32, MarketplaceError::TextTooLong);
        require!(price > 0, MarketplaceError::InvalidPrice);
    
        let product = &mut ctx.accounts.product;
    
        product.merchant = ctx.accounts.authority.key();
        product.product_id = product_id;
        product.title = title;
        product.description_uri = description_uri;
        product.image_uri = image_uri;
        product.category = category;
        product.price = price;
        product.stock = stock;
        product.sold = 0;
        product.active = true;
        product.created_at = Clock::get()?.unix_timestamp;
        product.bump = ctx.bumps.product;
        product.updated_at = Clock::get()?.unix_timestamp;
        product.deleted = false;
    
        Ok(())
    }

    pub fn update_product(
        ctx: Context<UpdateProduct>,
        title: String,
        description_uri: String,
        image_uri: String,
        category: String,
        price: u64,
        stock: u32,
        active: bool,
    ) -> Result<()> {
        require!(title.len() <= 64, MarketplaceError::TextTooLong);
        require!(description_uri.len() <= 200, MarketplaceError::TextTooLong);
        require!(image_uri.len() <= 250, MarketplaceError::TextTooLong);
        require!(category.len() <= 32, MarketplaceError::TextTooLong);
        require!(price > 0, MarketplaceError::InvalidPrice);
    
        let product = &mut ctx.accounts.product;
    
        product.title = title;
        product.description_uri = description_uri;
        product.image_uri = image_uri;
        product.category = category;
        product.price = price;
        product.stock = stock;
        product.active = active;
        product.updated_at = Clock::get()?.unix_timestamp;
    
        Ok(())
    }

    pub fn reduce_stock(
        ctx: Context<ReduceStock>,
        quantity: u32,
    ) -> Result<()> {
        let product = &mut ctx.accounts.product;

        require!(product.active, MarketplaceError::ProductInactive);
        require!(quantity > 0, MarketplaceError::InvalidQuantity);
        require!(product.stock >= quantity, MarketplaceError::InsufficientStock);

        product.stock -= quantity;
        product.sold += quantity;

        Ok(())
    }

    pub fn delete_product(ctx: Context<DeleteProduct>) -> Result<()> {
        let product = &mut ctx.accounts.product;
    
        product.active = false;
        product.deleted = true;
        product.updated_at = Clock::get()?.unix_timestamp;
    
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMerchant<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + MerchantProfile::INIT_SPACE,
        seeds = [b"merchant", authority.key().as_ref()],
        bump
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMerchant<'info> {
    #[account(
        mut,
        seeds = [b"merchant", authority.key().as_ref()],
        bump = merchant_profile.bump,
        constraint = merchant_profile.authority == authority.key() @ MarketplaceError::Unauthorized
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(product_id: u64)]
pub struct CreateProduct<'info> {
    #[account(
        seeds = [b"merchant", authority.key().as_ref()],
        bump = merchant_profile.bump,
        constraint = merchant_profile.authority == authority.key() @ MarketplaceError::Unauthorized,
        constraint = merchant_profile.active @ MarketplaceError::MerchantInactive
    )]
    pub merchant_profile: Account<'info, MerchantProfile>,

    #[account(
        init,
        payer = authority,
        space = 8 + Product::INIT_SPACE,
        seeds = [
            b"product",
            authority.key().as_ref(),
            &product_id.to_le_bytes()
        ],
        bump
    )]
    pub product: Account<'info, Product>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProduct<'info> {
    #[account(
        mut,
        seeds = [
            b"product",
            authority.key().as_ref(),
            &product.product_id.to_le_bytes()
        ],
        bump = product.bump,
        constraint = product.merchant == authority.key() @ MarketplaceError::Unauthorized
    )]
    pub product: Account<'info, Product>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReduceStock<'info> {
    #[account(mut)]
    pub product: Account<'info, Product>,
}

#[account]
#[derive(InitSpace)]
pub struct MerchantProfile {
    pub authority: Pubkey,

    #[max_len(64)]
    pub store_name: String,

    #[max_len(200)]
    pub description_uri: String,

    #[max_len(200)]
    pub logo_uri: String,

    #[max_len(200)]
    pub banner_uri: String,

    #[max_len(64)]
    pub location: String,

    pub active: bool,
    pub verified: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Product {
    pub merchant: Pubkey,
    pub product_id: u64,

    #[max_len(64)]
    pub title: String,

    #[max_len(200)]
    pub description_uri: String,

    #[max_len(250)]
    pub image_uri: String,

    #[max_len(32)]
    pub category: String,

    pub price: u64,
    pub stock: u32,
    pub sold: u32,
    pub active: bool,
    pub deleted: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct DeleteProduct<'info> {
    #[account(
        mut,
        seeds = [
            b"product",
            authority.key().as_ref(),
            &product.product_id.to_le_bytes()
        ],
        bump = product.bump,
        constraint = product.merchant == authority.key() @ MarketplaceError::Unauthorized
    )]
    pub product: Account<'info, Product>,

    pub authority: Signer<'info>,
}

#[error_code]
pub enum MarketplaceError {
    #[msg("Unauthorized")]
    Unauthorized,

    #[msg("Text too long")]
    TextTooLong,

    #[msg("Invalid price")]
    InvalidPrice,

    #[msg("Invalid quantity")]
    InvalidQuantity,

    #[msg("Insufficient stock")]
    InsufficientStock,

    #[msg("Merchant is inactive")]
    MerchantInactive,

    #[msg("Product is inactive")]
    ProductInactive,
}