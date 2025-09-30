interface TagProps {
    text: string;
}

const Tag = ({ text }: TagProps) => {
    return (
        <span className="p-3 bg-[#11172E] text-[12px] font-semibold text-center">
            {text}
        </span>
    );
};

export default Tag;
