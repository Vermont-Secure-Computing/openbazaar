import { GITHUB_REPO } from "../config/site";

export default function InstructionsContent() {
    return (
        <>
            <header className="instructions-header">
                <h1>Welcome to SolZaar</h1>

                <p>
                    SolZaar is an implementation of the OpenBazaar concept as a public Solana contract.
                </p>
            </header>

            <section className="instructions-warning">
                <p>
                    This is an open source project and there is nobody who can interfere with or moderate use of the existing contract. 
                </p>

                <p>
                    Use of the contract is at your own risk, please be aware all material is added by users and cannot be changed 
                    or deleted by the developers of the contract or any third parties!  Please read and understand all instructions below!
                </p>
            </section>

            <section className="instructions-section">
                <h2>How to Use SolZaar</h2>

                <p>
                    Solzaar is FREE TO USE.  However every transaction or interaction with the contract is a solana transaction 
                    and requires a small solana transaction fee.  If data is being added, this fee is slighly larger and is 
                    referred to as "rent".  The costs are still quite small but rent can be recovered by the user when the data is deleted
                    or removed from the contract.
                </p>

                <p>
                    It is recommended (for both merchants and customers) to run the user interface locally on your own machine, 
                    rather than relying on a server at a domain name.  Instructions for doing so should be available at the code repository.
                </p>
                <p>
                    GitHub Repository:
                    {" "}
                    <a
                        href="https://github.com/Vermont-Secure-Computing/openbazaar"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="instructions-link"
                    >
                        https://github.com/Vermont-Secure-Computing/openbazaar
                    </a>
                </p>

                <p>
                    Interfacting with solana contracts requires either running your own node, or using a solana api service, for which 
                    free and paid services are available.
                </p>

                <p>
                    All items are priced and paid with solana, the wallets which were used for testing are Phantom and Solflare.
                </p>
            </section>

            <section className="instructions-section">
                <h2>Communications</h2>

                <p>
                    As a merchant, be sure to include in your description how you would like to be contacted including any 
                    relevant information such as gpg public key fingerprint if you wish to use encrypted communications.  
                    Small messages can also be sent on the contract itself between buyer and merchant after an order is made, 
                    but be aware they are NOT PRIVATE, in theory anyone could examine the contract and see the messages, 
                    so do not include in these on-contract messages any personal information.
                </p>

                <p>
                    It is recommended that merchants include an email or messaging app ID in their description, 
                    and that customers include their solana address being used for the transaction in any communications, 
                    such as when they provide their delivery address.
                </p>
            </section>

            <section className="instructions-section">
                <h2>Images</h2>

                <p>
                    Images are not stored on-chain as this would be too expensive,  Instead, merchants should make their images available on a 
                    third party service such as imgur, ipfs, or otherwise, so that the url can be resolved by the user's browser and displayed.
                </p>

                <p>
                    Each product can have up to three images, and there are two images allowed for the merchant's description.
                </p>
            </section>

            <section className="instructions-section">
                <h2>Escrow</h2>

                <p>
                    Solzaar uses a two party escrow system as there is no moderation available in a decentralized system.
                </p>

                <p>
                    In this system, an extra deposit (in addition to the price of the product) is used to incentivise the two parties to 
                    finalize the transaction and collect their deposits.  Both the merchant and the buyer need to make this deposit. 
                    The merchant sets their desired amount of this extra deposit as a percentage of the product cost.  
                    After deposits have been made, both parties must agree for the funds to be withdrawn.
                </p>

                <h3>The payment flow is as follows:</h3>

                <ol>
                    <li>
                        <strong>Buyer creates the order.</strong>
                        <p>
                            The buyer indicates their interest by putting up the cost of the item (plus their additional deposit) into the contract escrow.  At this point the buyer can cancel at any time and receive all funds.
                        </p>
                    </li>

                    <li>
                        <strong>Seller accepts and deposits.</strong>
                        <p>
                            The seller acknowledges the request and makes their deposit into the contract escrow, at this point locking the escrow 
                            (nobody can withdraw their funds by themselves now).  The seller then ships the product after which they mark the order 
                            as "ready for finalization".  At this point either party can still request a full cancellation, and if agreed upon by 
                            the other party, a full refund is issued to both parties.
                        </p>
                    </li>

                    <li>
                        <strong>Buyer confirms delivery.</strong>
                        <p>
                            The buyer receives the product and confirms it is satisfactory.  At this point the buyer can release the funds, 
                            which means they will receive their deposit, while the seller receives the cost of the item and their deposit.  
                            A review can no be issued to the contract if desived, updating seller reputation.  The order can also be deleted 
                            to recover the rent.
                        </p>
                    </li>
                </ol>

                <p>
                    This system provides an additional incentive for the buyer to release the funds after receiving the product, 
                    as they will also receive their deposit back.  Both parties have incentive to close the escrow to obtain their deposits.
                </p>

                <div className="instructions-danger">

                    <p>
                        Note however that if either party disappears, loses their keys or becomes unable to continue to participate, 
                        the funds locked in the contract escrow will remain locked forever.
                    </p>

                    <p>
                        If the product is not satisfactory, the two parties can discuss an appropriate distribution of the escrowed funds. 
                        Without an agreement between the two parites however, the funds including additional deposits will all remain locked on the contract forever.  
                    </p>
                </div>
            </section>

            <section className="instructions-section">
                <h2>Donations</h2>

                <p>
                    This open source contract is FREE TO USE.  If you find it profitable or wish to support the developers of this contract 
                    to continue their work, the seller has a chance to give some percentage of the sale price to the developers, 
                    as they mark an order ready for finalization.
                </p>
                <p>Thank you for your support.</p>
            </section>

            <section className="instructions-section">
                <h2>Legal</h2>

                <p>
                    Buyers and sellers have the full responsibility to obey any relevant laws in their jurisdictions.  
                    The solana contract does not provide any privacy services, all on-chain transactions are public and all records 
                    are available to any party including law enforcement.
                </p>
            </section>

            <section className="instructions-section">
                <h2>Privacy</h2>

                <p>
                    If buyer or seller wishes to have privacy or anonymity it is their responsibility to ensure private information is not 
                    included on-chain and that no on-chain information or metadata identifies them.
                </p>
            </section>
        </>
    );
}